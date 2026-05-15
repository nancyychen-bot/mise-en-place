# Auto-Booking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-restaurant auto-booking for Resy, OpenTable, and SevenRooms — when a new slot is found, automatically book the one closest to the user's preferred time.

**Architecture:** Auth tokens stored per-user in `user_settings`. Booking happens where slots are discovered: GH Actions for Resy/OpenTable, Vercel cron for SevenRooms. Auto-book toggle + preferred time live on each restaurant. Token expiry detection disables auto-book and shows banner + ntfy.

**Tech Stack:** Supabase (Postgres), Next.js App Router, Playwright (OpenTable booking), Resy REST API, SevenRooms REST API, ntfy.sh

**Spec:** `docs/superpowers/specs/2026-05-15-auto-booking-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `supabase/migrations/006_auto_booking.sql` | Create | Schema: add columns to user_settings + restaurants |
| `lib/types.ts` | Modify | Add auto_book, preferred_time to Restaurant; add token fields to UserSettings |
| `lib/resy-booking.ts` | Create | Resy booking API: `/3/details` → `/3/book` |
| `lib/booking.ts` | Create | Shared: slot selection logic (closest to preferred time) |
| `app/api/account/route.ts` | Modify | Add token fields to GET/PATCH |
| `app/api/restaurants/[id]/route.ts` | Modify | Add auto_book, preferred_time to PATCH |
| `app/dashboard/account/page.tsx` | Modify | Add "Platform Connections" section with token fields + status dots |
| `app/dashboard/setup/page.tsx` | Modify | Add Step 3: "Connect your accounts for auto-booking" |
| `app/dashboard/watchlist-client.tsx` | Modify | Add token-expired banner |
| `components/restaurant-card.tsx` | Modify | Add auto-book toggle + preferred time + confirmation dialog |
| `scripts/resy-checker/check.js` | Modify | Add booking logic after slot discovery |
| `scripts/opentable-checker/check.js` | Modify | Add Playwright booking after slot discovery |
| `lib/checker.ts` | Modify | Add SevenRooms booking logic in Vercel cron |

---

### Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/006_auto_booking.sql`

- [ ] **Step 1: Write the migration**

```sql
-- Auto-booking: auth tokens on user_settings, booking controls on restaurants
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS resy_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS opentable_session TEXT,
  ADD COLUMN IF NOT EXISTS sevenrooms_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expired JSONB NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS auto_book BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_time TEXT;
```

- [ ] **Step 2: Run migration in Supabase SQL editor**

Copy the SQL above and execute it in the Supabase dashboard SQL editor.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/006_auto_booking.sql
git commit -m "Add auto-booking schema: auth tokens + auto_book toggle"
```

---

### Task 2: Update Types

**Files:**
- Modify: `lib/types.ts`

- [ ] **Step 1: Add auto_book and preferred_time to Restaurant interface**

Add after the `dateEnd` field:

```typescript
  autoBook: boolean;
  preferredTime: string | null; // "19:30" (24h)
```

- [ ] **Step 2: Add token fields to UserSettings interface**

Add after `quietHoursEnd`:

```typescript
  resyAuthToken: string | null;
  opentableSession: string | null;
  sevenroomsAuthToken: string | null;
  tokenExpired: Record<string, boolean>;
```

- [ ] **Step 3: Commit**

```bash
git add lib/types.ts
git commit -m "Add auto-booking fields to Restaurant and UserSettings types"
```

---

### Task 3: Slot Selection Logic

**Files:**
- Create: `lib/booking.ts`

- [ ] **Step 1: Write the slot selector**

```typescript
import type { Slot } from './types';

/**
 * Pick the best slot to auto-book: closest to preferredTime,
 * or earliest if no preference set.
 */
export function pickBestSlot(slots: Slot[], preferredTime: string | null): Slot | null {
  if (slots.length === 0) return null;
  if (!preferredTime) return slots.sort((a, b) => a.time.localeCompare(b.time))[0];

  return slots.reduce((best, slot) => {
    const bestDiff = Math.abs(timeToMinutes(best.time) - timeToMinutes(preferredTime));
    const slotDiff = Math.abs(timeToMinutes(slot.time) - timeToMinutes(preferredTime));
    return slotDiff < bestDiff ? slot : best;
  });
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/booking.ts
git commit -m "Add slot selection logic for auto-booking"
```

---

### Task 4: Resy Booking API

**Files:**
- Create: `lib/resy-booking.ts`

- [ ] **Step 1: Write the Resy booking functions**

```typescript
const BASE = 'https://api.resy.com';

interface BookingDetails {
  bookToken: string;
  paymentMethodId: number | null;
}

interface BookingResult {
  success: boolean;
  confirmationId?: string;
  error?: string;
  authExpired?: boolean;
}

function resyHeaders(apiKey: string, authToken: string) {
  return {
    Authorization: `ResyAPI api_key="${apiKey}"`,
    'x-resy-auth-token': authToken,
    'Content-Type': 'application/x-www-form-urlencoded',
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36',
    'X-Origin': 'https://resy.com',
    Referer: 'https://resy.com/',
  };
}

export async function getResyBookingDetails(
  apiKey: string,
  authToken: string,
  configId: string,
  day: string,
  partySize: number,
): Promise<BookingDetails> {
  const params = new URLSearchParams({
    config_id: configId,
    day,
    party_size: String(partySize),
  });

  const res = await fetch(`${BASE}/3/details`, {
    method: 'POST',
    headers: resyHeaders(apiKey, authToken),
    body: params.toString(),
  });

  if (res.status === 401 || res.status === 403) {
    throw Object.assign(new Error('RESY_AUTH_EXPIRED'), { authExpired: true });
  }
  if (!res.ok) throw new Error(`details_http_${res.status}`);

  const data = await res.json() as Record<string, unknown>;
  const bookToken = (data as { book_token?: { value?: string } }).book_token?.value;
  if (!bookToken) throw new Error('no_book_token');

  const paymentMethodId = (data as { user?: { payment_methods?: { id: number }[] } })
    .user?.payment_methods?.[0]?.id ?? null;

  return { bookToken, paymentMethodId };
}

export async function bookResySlot(
  apiKey: string,
  authToken: string,
  bookToken: string,
  paymentMethodId: number | null,
): Promise<BookingResult> {
  const params = new URLSearchParams({ book_token: bookToken });
  if (paymentMethodId != null) {
    params.set('struct_payment_method', JSON.stringify({ id: paymentMethodId }));
  }

  const res = await fetch(`${BASE}/3/book`, {
    method: 'POST',
    headers: resyHeaders(apiKey, authToken),
    body: params.toString(),
  });

  if (res.status === 401 || res.status === 403) {
    return { success: false, error: 'auth_expired', authExpired: true };
  }
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    return { success: false, error: `http_${res.status}: ${text.slice(0, 200)}` };
  }

  const data = await res.json() as Record<string, unknown>;
  const resyToken = (data as { resy_token?: string }).resy_token;
  return { success: true, confirmationId: resyToken ?? 'confirmed' };
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/resy-booking.ts
git commit -m "Add Resy booking API (details + book)"
```

---

### Task 5: Account API — Add Token Fields

**Files:**
- Modify: `app/api/account/route.ts`

- [ ] **Step 1: Update GET to include token fields**

In the select query, add the new columns:

```typescript
.select('ntfy_topic, ntfy_priority, monitoring_enabled, timezone, resy_api_key, resy_auth_token, opentable_session, sevenrooms_auth_token, token_expired')
```

Add to the response JSON:

```typescript
resyAuthToken: settings?.resy_auth_token ? '••••••' : null,
opentableSession: settings?.opentable_session ? '••••••' : null,
sevenroomsAuthToken: settings?.sevenrooms_auth_token ? '••••••' : null,
tokenExpired: settings?.token_expired ?? {},
```

Note: tokens are masked in GET responses — only a boolean "is set" indicator is needed. Use `'••••••'` as a sentinel so the UI can show "Connected" vs "Not connected".

- [ ] **Step 2: Update PatchSchema to accept token fields**

Add to the zod schema:

```typescript
resyAuthToken: z.string().max(500).optional(),
opentableSession: z.string().max(500).optional(),
sevenroomsAuthToken: z.string().max(500).optional(),
```

- [ ] **Step 3: Update PATCH handler to save tokens**

Add after the existing `resyApiKey` handler:

```typescript
if (d.resyAuthToken !== undefined) {
  settingsUpdate.resy_auth_token = d.resyAuthToken || null;
  // Clear expired flag when token is updated
  const expired = { ...(settings?.token_expired ?? {}) };
  delete expired.resy;
  settingsUpdate.token_expired = expired;
}
if (d.opentableSession !== undefined) {
  settingsUpdate.opentable_session = d.opentableSession || null;
  const expired = { ...(settings?.token_expired ?? {}) };
  delete expired.opentable;
  settingsUpdate.token_expired = expired;
}
if (d.sevenroomsAuthToken !== undefined) {
  settingsUpdate.sevenrooms_auth_token = d.sevenroomsAuthToken || null;
  const expired = { ...(settings?.token_expired ?? {}) };
  delete expired.sevenrooms;
  settingsUpdate.token_expired = expired;
}
```

Note: the PATCH handler needs to read current `token_expired` to merge. Add a settings read at the top of the PATCH handler if not already present.

- [ ] **Step 4: Commit**

```bash
git add app/api/account/route.ts
git commit -m "Add platform auth token fields to account API"
```

---

### Task 6: Restaurant API — Add auto_book and preferred_time

**Files:**
- Modify: `app/api/restaurants/[id]/route.ts`

- [ ] **Step 1: Add fields to PatchSchema**

```typescript
autoBook: z.boolean().optional(),
preferredTime: z.string().regex(timeRe).nullable().optional(),
```

- [ ] **Step 2: Add fields to the update mapping**

```typescript
if (parsed.data.autoBook !== undefined) updates.auto_book = parsed.data.autoBook;
if (parsed.data.preferredTime !== undefined) updates.preferred_time = parsed.data.preferredTime;
```

- [ ] **Step 3: Commit**

```bash
git add app/api/restaurants/[id]/route.ts
git commit -m "Add auto_book and preferred_time to restaurant PATCH"
```

---

### Task 7: Account Settings UI — Platform Connections

**Files:**
- Modify: `app/dashboard/account/page.tsx`

- [ ] **Step 1: Add Platform Connections section**

Add a new section after the existing sections (where the API Keys section used to be). Each platform gets a password input + status dot:

```tsx
{/* Platform Connections (for auto-booking) */}
<div style={sectionStyle}>
  <h2 style={sectionHeaderStyle}>Platform Connections</h2>
  <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '16px' }}>
    Connect your accounts to enable auto-booking. See the{' '}
    <Link href="/dashboard/setup" style={{ textDecoration: 'underline' }}>Setup Guide</Link>{' '}
    for instructions.
  </p>
  {(['resy', 'opentable', 'sevenrooms'] as const).map((platform) => {
    const fieldMap = { resy: 'resyAuthToken', opentable: 'opentableSession', sevenrooms: 'sevenroomsAuthToken' } as const;
    const labelMap = { resy: 'Resy', opentable: 'OpenTable', sevenrooms: 'SevenRooms' } as const;
    const field = fieldMap[platform];
    const isSet = !!data[field];
    const isExpired = data.tokenExpired?.[platform] === true;
    const dotColor = isExpired ? 'var(--tag-red)' : isSet ? 'var(--tag-green)' : 'var(--text-muted)';
    const statusText = isExpired ? 'Expired' : isSet ? 'Connected' : 'Not connected';

    return (
      <FieldRow key={platform} label={`${labelMap[platform]} Token`} description={statusText}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotColor, flexShrink: 0 }} />
          <input
            type="password"
            style={inputStyle}
            value={data[field] ?? ''}
            onChange={(e) => setData((d) => ({ ...d, [field]: e.target.value || null }))}
            placeholder="Paste token here"
            autoComplete="off"
          />
        </div>
      </FieldRow>
    );
  })}
</div>
```

- [ ] **Step 2: Add token fields to the data state and fetch**

Update the initial state and GET response handling to include:
- `resyAuthToken`, `opentableSession`, `sevenroomsAuthToken` (string | null)
- `tokenExpired` (Record<string, boolean>)

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/account/page.tsx
git commit -m "Add Platform Connections section to account settings"
```

---

### Task 8: Setup Guide — Auto-booking Step

**Files:**
- Modify: `app/dashboard/setup/page.tsx`

- [ ] **Step 1: Add Step 3 after the existing steps**

Renumber the existing "Add your first restaurant" step to Step 3, and insert a new Step 2:

```tsx
<Step number={2} eyebrow="Optional" title="Connect your accounts for auto-booking">
  <p style={descStyle}>
    If you want Mise en Place to automatically book reservations when a slot opens,
    you&rsquo;ll need to connect your restaurant platform accounts. This gives the app
    permission to book on your behalf.
  </p>

  <Callout variant="warn">
    <strong>Auto-booking may charge your card.</strong> Some restaurants require deposits.
    By connecting your account, you authorize automatic bookings including any associated charges.
  </Callout>

  <strong style={{ fontSize: '13px' }}>For Resy:</strong>
  <ol style={{ margin: '12px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
    <li>Log into <strong>resy.com</strong> in your browser</li>
    <li>Open DevTools (<code className="code">Cmd + Option + I</code> on Mac, <code className="code">F12</code> on Windows)</li>
    <li>Go to the <strong>Network</strong> tab, then search for any restaurant on Resy</li>
    <li>Click any <code className="code">api.resy.com</code> request, then click <strong>Headers</strong></li>
    <li>Find <code className="code">x-resy-auth-token</code> and copy the value</li>
    <li>Paste it into the Resy Token field on your <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>Account</Link> page</li>
  </ol>

  <strong style={{ fontSize: '13px' }}>For OpenTable:</strong>
  <ol style={{ margin: '12px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
    <li>Log into <strong>opentable.com</strong> in your browser</li>
    <li>Open DevTools → <strong>Application</strong> tab → <strong>Cookies</strong></li>
    <li>Find and copy the <code className="code">csrf_token</code> cookie value</li>
    <li>Paste it into the OpenTable Token field on your <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>Account</Link> page</li>
  </ol>

  <strong style={{ fontSize: '13px' }}>For SevenRooms:</strong>
  <ol style={{ margin: '12px 0 16px 22px', fontSize: '14px', lineHeight: 1.7, color: 'var(--text)' }}>
    <li>Log into <strong>sevenrooms.com</strong>, open DevTools → <strong>Network</strong></li>
    <li>Make a reservation search, then find the <code className="code">Authorization</code> header</li>
    <li>Copy the token value and paste it on your <Link href="/dashboard/account" style={{ textDecoration: 'underline' }}>Account</Link> page</li>
  </ol>
</Step>
```

- [ ] **Step 2: Renumber "Add your first restaurant" to Step 3**

- [ ] **Step 3: Commit**

```bash
git add app/dashboard/setup/page.tsx
git commit -m "Add auto-booking setup instructions (Step 2)"
```

---

### Task 9: Restaurant Card — Auto-Book Toggle + Preferred Time

**Files:**
- Modify: `components/restaurant-card.tsx`

- [ ] **Step 1: Add auto-book state and preferred time to the editing section**

In the editing block (inside the `editing ? (...)` branch), after the Date Range section and before the Save/Cancel buttons, add:

```tsx
{restaurant.platform !== 'tock' && (
  <>
    <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
      Auto-Book
    </p>
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
      <button
        type="button"
        onClick={() => {
          if (!editAutoBook) {
            // Validate token exists — emit callback to parent
            if (!onValidateAutoBook?.(restaurant.platform)) return;
          }
          setEditAutoBook(!editAutoBook);
        }}
        style={{
          width: '44px', height: '26px', borderRadius: '13px',
          border: editAutoBook ? '1px solid var(--tag-green)' : '1px solid var(--border)',
          background: editAutoBook ? 'var(--tag-green)' : 'var(--bg)',
          cursor: 'pointer', position: 'relative', transition: 'all 0.2s', padding: 0,
        }}
      >
        <span
          style={{
            position: 'absolute', width: '18px', height: '18px', borderRadius: '50%',
            background: editAutoBook ? 'var(--bg)' : 'var(--text)',
            top: '3px', left: editAutoBook ? '22px' : '3px', transition: 'all 0.2s',
          }}
        />
      </button>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
        {editAutoBook ? 'Will auto-book best slot' : 'Notify only'}
      </span>
    </div>
    {editAutoBook && (
      <>
        <p style={{ fontSize: '10px', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '6px' }}>
          Preferred Time <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: '0' }}>(books closest match)</span>
        </p>
        <input
          type="time"
          value={editPreferredTime}
          onChange={(e) => setEditPreferredTime(e.target.value)}
          style={{ ...timeInputStyle, marginBottom: '10px' }}
        />
      </>
    )}
  </>
)}
```

- [ ] **Step 2: Add state variables**

At the top of the component, add:

```typescript
const [editAutoBook, setEditAutoBook] = useState(restaurant.autoBook ?? false);
const [editPreferredTime, setEditPreferredTime] = useState(restaurant.preferredTime ?? '');
```

Add `onValidateAutoBook` to the props interface:

```typescript
onValidateAutoBook?: (platform: Platform) => boolean;
```

- [ ] **Step 3: Update handleSave to include new fields**

Add to the PATCH body:

```typescript
autoBook: editAutoBook,
preferredTime: editPreferredTime || null,
```

Add to the `onUpdate` call:

```typescript
autoBook: editAutoBook,
preferredTime: editPreferredTime || null,
```

- [ ] **Step 4: Show auto-book badge on card when enabled (non-editing view)**

After the platform tag, add a small indicator:

```tsx
{restaurant.autoBook && (
  <span style={{ fontSize: '9px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--tag-green)', marginTop: '4px' }}>
    Auto-book · {restaurant.preferredTime ? fmt12h(restaurant.preferredTime) : 'earliest'}
  </span>
)}
```

- [ ] **Step 5: Commit**

```bash
git add components/restaurant-card.tsx
git commit -m "Add auto-book toggle and preferred time to restaurant card"
```

---

### Task 10: Watchlist Client — Token Validation + Expired Banner

**Files:**
- Modify: `app/dashboard/watchlist-client.tsx`
- Modify: `app/dashboard/page.tsx`

- [ ] **Step 1: Pass token state to WatchlistClient**

In `page.tsx`, add `tokenExpired` to the props passed to WatchlistClient (read from user_settings).

- [ ] **Step 2: Add expired banner at top of watchlist**

Before `<PreferencesBar>`, add:

```tsx
{Object.entries(tokenExpired).filter(([, v]) => v).map(([platform]) => (
  <div
    key={platform}
    style={{
      background: 'var(--tag-red)', color: 'var(--bg)', padding: '10px 16px',
      fontSize: '13px', fontWeight: 500, marginBottom: '12px',
      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    }}
  >
    <span>Your {platform} token has expired. Auto-booking is paused.</span>
    <a href="/dashboard/account" style={{ color: 'var(--bg)', fontWeight: 700, textDecoration: 'underline' }}>
      Update token →
    </a>
  </div>
))}
```

- [ ] **Step 3: Add onValidateAutoBook handler**

Pass a validation callback to `RestaurantCard` that checks whether the platform's token is set and not expired. If validation fails, show an alert/pop-up:

```typescript
function handleValidateAutoBook(platform: Platform): boolean {
  // Check if token exists (would need to fetch from account API or pass down)
  // For now, show alert directing to setup
  alert(`Set up your ${platform} token first.\nGo to Settings → Platform Connections, or see the Setup Guide.`);
  return false;
}
```

- [ ] **Step 4: Commit**

```bash
git add app/dashboard/watchlist-client.tsx app/dashboard/page.tsx
git commit -m "Add token expired banner and auto-book validation"
```

---

### Task 11: Resy Checker — Auto-Booking Logic

**Files:**
- Modify: `scripts/resy-checker/check.js`

- [ ] **Step 1: Load auto_book and preferred_time with restaurants**

Update the select query to include:

```javascript
.select('id, user_id, name, venue_id, venue_city, party_size, party_sizes, earliest_time, latest_time, day_range, date_start, date_end, auto_book, preferred_time')
```

- [ ] **Step 2: Load auth tokens for users with auto_book restaurants**

After loading settings, load auth tokens for users who have auto_book enabled:

```javascript
const autoBookUserIds = [...new Set(
  restaurants.filter(r => r.auto_book).map(r => r.user_id)
)];
const authTokenMap = new Map();
if (autoBookUserIds.length > 0) {
  const { data: tokens } = await db
    .from('user_settings')
    .select('user_id, resy_auth_token, token_expired')
    .in('user_id', autoBookUserIds);
  for (const t of tokens ?? []) {
    if (t.resy_auth_token && !t.token_expired?.resy) {
      authTokenMap.set(t.user_id, t.resy_auth_token);
    }
  }
}
```

- [ ] **Step 3: Add booking after slot distribution**

In the distribution loop, after filtering slots, check if auto_book is enabled and new slots exist. Compare against previously stored slots to find new ones:

```javascript
for (const { restaurant, settings } of venue.restaurants) {
  const earliest = restaurant.earliest_time || settings.earliest_time;
  const latest = restaurant.latest_time || settings.latest_time;
  const filtered = rawSlots.filter(s => inWindow(s.time, earliest, latest));

  // Detect new slots (not in previous available_slots)
  const prevKeys = new Set(
    (restaurant.available_slots ?? []).map(s => `${s.date}:${s.time}`)
  );
  const newSlots = filtered.filter(s => !prevKeys.has(`${s.date}:${s.time}`));

  // Auto-book if enabled and new slots found
  if (restaurant.auto_book && newSlots.length > 0) {
    const authToken = authTokenMap.get(restaurant.user_id);
    if (authToken) {
      const best = pickBestSlot(newSlots, restaurant.preferred_time);
      if (best?.bookingToken) {
        try {
          const details = await getResyBookingDetails(
            resyApiKey, authToken, best.bookingToken, best.date,
            restaurant.party_sizes?.[0] ?? restaurant.party_size
          );
          const result = await bookResySlot(resyApiKey, authToken, details.bookToken, details.paymentMethodId);
          if (result.success) {
            console.log(`[resy-check] AUTO-BOOKED ${restaurant.name} at ${best.displayTime} on ${best.date}`);
            await db.from('restaurants').update({ auto_book: false }).eq('id', restaurant.id);
            await db.from('activity_log').insert({
              user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
              message: `Auto-booked <strong>${restaurant.name}</strong> at ${best.displayTime} on ${best.date}`,
            });
            // Send ntfy notification
            const ntfyTopic = settingsMap.get(restaurant.user_id)?.ntfy_topic;
            if (ntfyTopic) {
              await fetch(`https://ntfy.sh/${encodeURIComponent(ntfyTopic)}`, {
                method: 'POST',
                headers: { Title: `Booked! ${restaurant.name}`, Priority: 'high', Tags: 'white_check_mark' },
                body: `${best.displayTime} on ${best.date} for ${restaurant.party_sizes?.[0] ?? restaurant.party_size} guests`,
              });
            }
          } else if (result.authExpired) {
            console.error(`[resy-check] auth expired for user ${restaurant.user_id}`);
            await handleAuthExpired(restaurant.user_id, 'resy');
          } else {
            console.error(`[resy-check] booking failed for ${restaurant.name}: ${result.error}`);
          }
        } catch (err) {
          if (err.authExpired) {
            await handleAuthExpired(restaurant.user_id, 'resy');
          } else {
            console.error(`[resy-check] booking error for ${restaurant.name}: ${err.message}`);
          }
        }
      }
    }
  }

  // ... existing DB update code ...
}
```

- [ ] **Step 4: Add handleAuthExpired helper**

```javascript
async function handleAuthExpired(userId, platform) {
  // Mark token as expired
  const { data: current } = await db
    .from('user_settings')
    .select('token_expired, ntfy_topic')
    .eq('user_id', userId)
    .single();
  const expired = { ...(current?.token_expired ?? {}), [platform]: true };
  await db.from('user_settings').update({ token_expired: expired }).eq('user_id', userId);

  // Disable auto_book on all user's restaurants for this platform
  await db.from('restaurants')
    .update({ auto_book: false })
    .eq('user_id', userId)
    .eq('platform', platform);

  // Notify user
  if (current?.ntfy_topic) {
    await fetch(`https://ntfy.sh/${encodeURIComponent(current.ntfy_topic)}`, {
      method: 'POST',
      headers: { Title: `${platform} token expired`, Priority: 'high', Tags: 'warning' },
      body: `Auto-booking paused. Update your ${platform} token in account settings.`,
    });
  }

  await db.from('activity_log').insert({
    user_id: userId, type: 'system',
    message: `<strong>${platform}</strong> token expired — auto-booking disabled.`,
  });
}
```

- [ ] **Step 5: Add pickBestSlot function to check.js**

Since check.js is standalone (not in the Next.js build), inline the slot selection logic:

```javascript
function pickBestSlot(slots, preferredTime) {
  if (slots.length === 0) return null;
  if (!preferredTime) return slots.sort((a, b) => a.time.localeCompare(b.time))[0];
  function toMin(t) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
  const prefMin = toMin(preferredTime);
  return slots.reduce((best, slot) => {
    return Math.abs(toMin(slot.time) - prefMin) < Math.abs(toMin(best.time) - prefMin) ? slot : best;
  });
}
```

- [ ] **Step 6: Update restaurant select to include available_slots for dedup**

The venue distribution loop needs previous `available_slots` to detect which slots are new. The restaurants query already fetches all columns, so `restaurant.available_slots` is available.

- [ ] **Step 7: Commit**

```bash
git add scripts/resy-checker/check.js
git commit -m "Add auto-booking to Resy GH Actions checker"
```

---

### Task 12: SevenRooms Booking in Vercel Cron

**Files:**
- Modify: `lib/checker.ts`

- [ ] **Step 1: Add booking logic after new slot detection**

In `checkUserWatchlist`, after the existing `newSlots.length > 0` block that sends notifications, add auto-booking for SevenRooms:

```typescript
if (newSlots.length > 0 && restaurant.auto_book && restaurant.platform === 'sevenrooms') {
  const authToken: string | null = settings.sevenrooms_auth_token ?? null;
  if (authToken) {
    const best = pickBestSlot(newSlots, restaurant.preferred_time ?? null);
    if (best) {
      // SevenRooms booking API call
      // TODO: implement after researching SevenRooms booking endpoint
      // For now, log that auto-book was attempted
      console.log(`[checker] SevenRooms auto-book: would book ${restaurant.name} at ${best.displayTime}`);
    }
  }
}
```

Note: SevenRooms booking API research is needed for full implementation. The structure follows the same pattern as Resy. Leave as a stub and implement when the API is confirmed.

- [ ] **Step 2: Add necessary imports and field reads**

Add `pickBestSlot` import from `lib/booking.ts`. Add `sevenrooms_auth_token` and `auto_book` and `preferred_time` to the relevant select queries.

- [ ] **Step 3: Commit**

```bash
git add lib/checker.ts
git commit -m "Add SevenRooms auto-booking stub in Vercel cron"
```

---

### Task 13: OpenTable Booking via Playwright

**Files:**
- Modify: `scripts/opentable-checker/check.js`

- [ ] **Step 1: Add booking flow after slot discovery**

After slots are scraped and filtered, check for auto_book restaurants with new slots. Use Playwright to navigate through the OpenTable booking flow:

```javascript
if (restaurant.auto_book && allSlots.length > 0) {
  const prevKeys = new Set(
    (restaurant.available_slots ?? []).map(s => `${s.date}:${s.time}`)
  );
  const newSlots = allSlots.filter(s => !prevKeys.has(`${s.date}:${s.time}`));

  if (newSlots.length > 0) {
    const best = pickBestSlot(newSlots, restaurant.preferred_time);
    if (best) {
      // Load user's OpenTable session token
      const { data: userSettings } = await db
        .from('user_settings')
        .select('opentable_session, token_expired, ntfy_topic')
        .eq('user_id', restaurant.user_id)
        .single();

      if (userSettings?.opentable_session && !userSettings.token_expired?.opentable) {
        try {
          const booked = await bookOpenTableSlot(page, restaurant, best, userSettings.opentable_session);
          if (booked) {
            console.log(`[check] AUTO-BOOKED ${restaurant.name} at ${best.displayTime} on ${best.date}`);
            await db.from('restaurants').update({ auto_book: false }).eq('id', restaurant.id);
            await db.from('activity_log').insert({
              user_id: restaurant.user_id, restaurant_id: restaurant.id, type: 'system',
              message: `Auto-booked <strong>${restaurant.name}</strong> at ${best.displayTime} on ${best.date}`,
            });
            if (userSettings.ntfy_topic) {
              await fetch(`https://ntfy.sh/${encodeURIComponent(userSettings.ntfy_topic)}`, {
                method: 'POST',
                headers: { Title: `Booked! ${restaurant.name}`, Priority: 'high', Tags: 'white_check_mark' },
                body: `${best.displayTime} on ${best.date}`,
              });
            }
          }
        } catch (err) {
          console.error(`[check] OpenTable booking failed: ${err.message}`);
        }
      }
    }
  }
}
```

- [ ] **Step 2: Implement bookOpenTableSlot function**

```javascript
async function bookOpenTableSlot(page, restaurant, slot, sessionToken) {
  // Navigate to the time slot on OpenTable
  const url = `https://www.opentable.com/booking/restref/availability?rid=${restaurant.venue_id}&restRef=${restaurant.venue_id}&partySize=${restaurant.party_size}&date=${slot.date}&time=${slot.time}%3A00&lang=en-US`;
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  // Set session cookies for authentication
  await page.context().addCookies([{
    name: 'csrf_token',
    value: sessionToken,
    domain: '.opentable.com',
    path: '/',
  }]);

  // Click the matching time slot button
  const timeBtn = page.locator(`button:has-text("${slot.displayTime}")`).first();
  if (await timeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
    await timeBtn.click();
    await page.waitForTimeout(2000);

    // Click "Complete reservation" or similar
    const completeBtn = page.locator('button:has-text("Complete"), button:has-text("Reserve")').first();
    if (await completeBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await completeBtn.click();
      await page.waitForTimeout(3000);

      // Verify confirmation
      const bodyText = await page.evaluate(() => document.body.innerText.slice(0, 500));
      return bodyText.toLowerCase().includes('confirmed') || bodyText.toLowerCase().includes('reservation');
    }
  }
  return false;
}
```

Note: OpenTable's booking flow varies and may require additional steps (guest info, etc.). This is a starting point — test and adjust based on actual DOM.

- [ ] **Step 3: Add pickBestSlot and handleAuthExpired helpers** (same as Task 11)

- [ ] **Step 4: Update restaurant select to include auto_book, preferred_time, available_slots**

- [ ] **Step 5: Commit**

```bash
git add scripts/opentable-checker/check.js
git commit -m "Add auto-booking to OpenTable GH Actions checker"
```

---

### Task 14: Integration Testing

- [ ] **Step 1: Test Resy auto-booking end-to-end**

1. Set your resy_auth_token in Supabase directly (or via account settings once Task 7 is deployed)
2. Enable auto_book on a Resy restaurant, set preferred_time
3. Trigger the GH Actions Resy checker
4. Verify: booking attempt logged, auto_book set to false on success, ntfy notification sent

- [ ] **Step 2: Test token expiry flow**

1. Set an invalid/expired resy_auth_token
2. Enable auto_book on a restaurant
3. Trigger checker
4. Verify: token_expired set, auto_book disabled on all Resy restaurants, ntfy sent, dashboard banner shows

- [ ] **Step 3: Test toggle validation**

1. With no auth token set, try enabling auto_book on a restaurant
2. Verify: pop-up appears directing to setup guide
3. With an expired token, try enabling auto_book
4. Verify: pop-up about expired token

- [ ] **Step 4: Commit any fixes**

```bash
git add -A
git commit -m "Fix integration test findings for auto-booking"
```

---

## Execution Order

Tasks 1-3 are foundational (schema + types + shared logic). Tasks 4-6 are backend APIs. Tasks 7-10 are UI. Tasks 11-13 are the booking implementations. Task 14 is integration testing.

Recommended parallel tracks:
- **Track A (backend):** Tasks 1 → 2 → 3 → 4 → 5 → 6 → 11 → 12 → 13
- **Track B (frontend):** Tasks 7 → 8 → 9 → 10

Track B can start after Tasks 1-2 are complete (needs schema + types).
