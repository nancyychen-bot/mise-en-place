# Auto-Booking Design Spec

## Overview

Per-restaurant auto-booking that books the best matching slot when availability opens. Supports Resy, OpenTable, and SevenRooms. Requires the user's personal auth token for each platform they want to auto-book on.

## Data Changes

### `user_settings` — new columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `resy_auth_token` | text | null | Personal Resy session token (`x-resy-auth-token` header) |
| `opentable_session` | text | null | OpenTable session cookie/token |
| `sevenrooms_auth_token` | text | null | SevenRooms auth token |
| `token_expired` | jsonb | `{}` | Per-platform expiry flags, e.g. `{ "resy": true }` |

### `restaurants` — new columns

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `auto_book` | boolean | false | Whether to auto-book when a matching slot is found |
| `preferred_time` | text | null | Preferred reservation time, e.g. `"19:30"`. Used to pick the best slot when multiple match. |

## Auto-Book Eligibility

- Available for **Resy**, **OpenTable**, and **SevenRooms** only (not Tock)
- Requires the corresponding platform auth token to be set and not expired
- Toggle is hidden for Tock restaurants

## Booking Flow

### Trigger

Booking happens where slots are discovered:

- **Resy and OpenTable:** In the GH Actions Playwright checker (`scripts/resy-checker/check.js` and `scripts/opentable-checker/check.js`). After finding new slots for a restaurant with `auto_book = true`, the checker loads the user's auth token from Supabase and books immediately — before writing results back. The checker also sends the ntfy notification and writes to `activity_log` directly.
- **SevenRooms:** In the Vercel cron (`checkUserWatchlist` in `lib/checker.ts`), since SevenRooms slots are fetched there directly.

Steps:
1. From the new slots, pick the one closest to `preferred_time` (or earliest if no preferred time set)
2. Attempt to book via the platform's booking API
3. Handle success or failure

### Resy Booking

1. Call `POST /3/details` with:
   - `config_id`: from the slot's `bookingToken`
   - `party_size`: restaurant's party size
   - `day`: slot date
   - Headers: `Authorization: ResyAPI api_key="..."` + `x-resy-auth-token: <user_token>`
2. Extract `book_token` from the details response
3. Call `POST /3/book` with the `book_token`
   - Headers: same as above
4. Response contains confirmation details

### OpenTable Booking

Uses Playwright in the GH Actions checker (same browser session that checks availability):

1. After finding a slot, navigate to the OpenTable booking page with the slot's date/time/party pre-filled
2. Use stored session cookies to authenticate
3. Click through: select time → fill details → confirm
4. Verify confirmation page loads

### SevenRooms Booking

1. Call the SevenRooms booking API endpoint with:
   - Venue slug, date, time, party size
   - Auth token in headers
2. Confirm booking from response

## Slot Selection Logic

When multiple new slots match a restaurant's time window:

1. If `preferred_time` is set: pick the slot with the smallest absolute time difference from preferred
2. If `preferred_time` is null: pick the earliest slot in the window
3. Book exactly one slot per restaurant per check cycle

## Post-Booking Behavior

### On Success

1. Send ntfy notification: "Booked! [Restaurant] at [time] on [date]"
2. Set `auto_book = false` on that restaurant (prevents double-booking)
3. Keep `active = true` (monitoring continues, user still sees new slots)
4. Log to `activity_log` with type `'system'`: "Auto-booked [Restaurant] at [time] on [date]"

### On Auth Failure (401/403)

1. Set `token_expired` for that platform to `true` in `user_settings`
2. Set `auto_book = false` on ALL of that user's restaurants on that platform
3. Send ntfy: "Auto-book failed for [Restaurant]: [platform] token expired — update it in settings"
4. Log to `activity_log`

### On Other Failure (network error, 500, etc.)

1. Log the error to `activity_log`
2. Send ntfy: "Auto-book failed for [Restaurant]: [error]. Will retry next check."
3. Do NOT disable auto_book — transient failures should retry automatically

## UI Changes

### Setup Guide — New Step 3: "Connect your accounts for auto-booking (optional)"

Per-platform instructions with screenshots:

- **Resy:** Log into resy.com → DevTools → Network tab → find any `api.resy.com` request → copy `x-resy-auth-token` header value → paste into account settings
- **OpenTable:** Log into opentable.com → DevTools → Application → Cookies → find `authCke` cookie → copy its value → paste into account settings
- **SevenRooms:** Log into sevenrooms.com → DevTools → Network tab → find auth header → paste into account settings

### Account Settings — New "Platform Connections" section

Per-platform token fields:
- Resy auth token (password-masked input)
- OpenTable session (password-masked input)
- SevenRooms auth token (password-masked input)

Each with a status indicator:
- Green dot: "Connected"
- Red dot: "Expired — update your token"
- Gray dot: "Not connected"

### Restaurant Customize — New fields

- **Auto-book toggle**: shown for Resy, OpenTable, SevenRooms restaurants only (hidden for Tock)
  - On toggle-on: validate that the platform's auth token exists and is not expired
  - If missing: pop-up "Set up your [platform] auth token first" with link to setup guide
  - If expired: pop-up "Your [platform] token has expired — update it in account settings"
  - On first enable: confirmation dialog "Auto-booking will book reservations automatically. Some restaurants require deposits — your card on file with [platform] may be charged. Continue?"
- **Preferred time**: time picker input, shown when auto-book is enabled
  - Optional — defaults to earliest slot in window if not set

### Dashboard Banner

When any platform's `token_expired` is true, show a persistent banner at top of dashboard:

> "Your [platform] token has expired. Auto-booking is paused. [Update token →]"

Dismisses automatically when the user updates their token.

## Migration

```sql
-- user_settings
ALTER TABLE public.user_settings
  ADD COLUMN IF NOT EXISTS resy_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS opentable_session TEXT,
  ADD COLUMN IF NOT EXISTS sevenrooms_auth_token TEXT,
  ADD COLUMN IF NOT EXISTS token_expired JSONB NOT NULL DEFAULT '{}'::jsonb;

-- restaurants
ALTER TABLE public.restaurants
  ADD COLUMN IF NOT EXISTS auto_book BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS preferred_time TEXT;
```

## Security Considerations

- Auth tokens are stored in Supabase with RLS (user can only read/write their own)
- Tokens are never exposed in API responses to other users
- Tokens are masked in the UI (password input type)
- GH Actions checker accesses tokens via Supabase service role key (same as existing pattern)

## Out of Scope

- Tock auto-booking (involves payments)
- Booking multiple slots per restaurant
- Automatic token refresh (users must manually update expired tokens)
- Payment method management
