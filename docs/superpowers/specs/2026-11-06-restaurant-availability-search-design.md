# Restaurant Availability Search — Design

**Date:** 2026-11-06
**Status:** Draft — awaiting user review before planning

## Summary

A new dashboard feature that takes a URL (single restaurant, listicle article, or pasted list of names/URLs) along with a date, time window, and party size, then checks availability across Resy, OpenTable, and SevenRooms in parallel. Results stream into a table as each restaurant resolves and is checked. Each available slot links out to the provider's booking page — no in-app booking.

## Goals

- Turn a reading list (Infatuation guide, friend's recommendations, personal shortlist) into an actionable "who has a table right now" view in one step.
- Reuse existing availability-check code in `lib/resy.ts`, `lib/opentable.ts`, `lib/sevenrooms.ts` (including Resy's proxy/throttle fallback).
- Stream results so a 20-restaurant search feels responsive even when some providers are slow.

## Non-goals (v1)

- In-app booking (click-out only).
- Saving searches, watchlists, or auto-notifications — a follow-up.
- Non-NYC cities — supported via the city override field but not optimized for.
- Playwright-based scraping — plain `fetch` only unless a specific site forces otherwise.

## Architecture

New dashboard page `/dashboard/search` posts to a new streaming API route `/api/search`. The route runs two phases:

1. **Resolve** — classify input, extract a list of `{displayName, hintUrl?}`, then resolve each to `{provider, venueId, bookingUrl}` using article outbound links first, provider search as fallback.
2. **Check** — for each resolved venue, call the matching provider availability function with the date/window/party size. Checks run concurrently with a small pool (5 at a time) so no single provider is hammered.

Core logic lives in a new `lib/search/` folder:

- `classify.ts` — input shape detection (single URL vs article vs pasted list)
- `scrape-listicle.ts` — HTML → `{displayName, hintUrl?}[]` with Infatuation-specific rules + a generic fallback
- `resolve-venue.ts` — turns an entry into a `ResolvedVenue`, calling provider search when needed
- `check-availability.ts` — provider-agnostic wrapper that dispatches to the right `lib/<provider>.ts`
- `types.ts` — shared types

The API route in `app/api/search/route.ts` is the orchestrator. The UI reads an SSE stream and updates row state as events arrive.

## Data model

No database writes for v1. Results exist in page state only.

```ts
type ResolvedVenue = {
  id: string;              // stable per-row key
  displayName: string;
  provider: 'resy' | 'opentable' | 'sevenrooms' | null;
  venueId: string | null;  // provider-specific id/slug
  bookingUrl: string | null;
  resolveError?: string;   // set when provider is null
};

type Slot = { time: string; bookingUrl: string };

type AvailabilityResult =
  | { status: 'available'; slots: Slot[] }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'unsupported' };
```

## API contract: `POST /api/search`

**Request body:**

```ts
{
  input: string;           // URL, article URL, or newline-separated list
  date: string;            // YYYY-MM-DD
  windowStart: string;     // HH:mm, 24-hour
  windowEnd: string;       // HH:mm, 24-hour
  partySize: number;       // 1..20
  city?: string;           // default "New York"
}
```

**Response:** `text/event-stream` with these events:

1. `event: resolved` — `data: { venues: ResolvedVenue[] }` fires once after phase 1
2. `event: result` — `data: { id: string, result: AvailabilityResult }` fires per venue
3. `event: done` — `data: {}` fires when all checks complete

Hard failures before the stream starts (empty input, article fetch failed with zero fallback entries) return `400 { error: string }` instead of opening the stream.

## Resolve phase

### Classification (`classify.ts`)

- Input is a single line and matches `resy.com` / `opentable.com` / `sevenrooms.com` → **direct provider URL**. Extract `{provider, venueId}` from the URL.
- Input is a single line matching any other URL → **article URL**. Fetch and parse.
- Input has multiple lines → **pasted list**. Each line is either a URL (recurse to case 1 or 2) or a bare name.

### Article scraping (`scrape-listicle.ts`)

Fetch with plain `fetch` + follow redirects. Parse with `node-html-parser`.

**Infatuation-specific extractor:** each restaurant entry sits under a heading with its name; a "Book" / provider link lives in or near that block. Match on heading structure first.

**Generic extractor fallback:** collect all `<a>` tags whose href matches a known provider host, dedupe by href, and use the link text or nearest heading as the display name.

If both extractors return zero entries, the API returns `400` with "couldn't find restaurants in that URL — try pasting names directly."

### Venue resolution (`resolve-venue.ts`)

- Entry has a direct provider URL → extract `{provider, venueId}` from URL, no search.
- Entry has only a name → search providers in order **Resy → OpenTable → SevenRooms**, stopping at the first provider whose top result has name similarity above a threshold (e.g. token-set ratio > 0.75) **and** a matching city when known. If no provider crosses the threshold → set `resolveError` and render as "couldn't resolve." (Stop-on-first-match rather than best-across-providers, because provider scoring isn't comparable and Resy/OpenTable listings for the same venue are equivalent for our purposes.)

City is inferred from the article URL path (`/new-york/...`) when present; otherwise taken from the `city` request field; otherwise defaults to "New York."

## Check phase

`check-availability.ts` exposes a single function:

```ts
checkAvailability(venue: ResolvedVenue, opts: {
  date: string; windowStart: string; windowEnd: string; partySize: number;
}): Promise<AvailabilityResult>
```

It dispatches by `venue.provider` to the matching module in `lib/`. Each provider adapter is responsible for:

- Returning `AvailabilityResult`, never throwing out of the adapter.
- Filtering raw provider slots to those within `[windowStart, windowEnd]` for the given `date` and `partySize`.
- Logging and converting transient errors (Imperva throttling, proxy timeout, 5xx) into `{ status: 'error', message }` rather than crashing the whole run. Resy's existing proxy/throttle fallback applies.

Concurrency pool: max 5 in-flight checks. Per-restaurant soft timeout 20s (returns `error`).

## UI: `/dashboard/search`

Behind the existing dashboard auth guard.

**Form:**
- Textarea labeled "URL, article, or list of restaurants"
- Date picker (default: today)
- Time window — start + end pickers (default 19:00 / 21:00)
- Party size stepper (default 2)
- City override (default "New York")
- "Search" button

**Results table** appears once the first `resolved` event fires:

- Columns: Restaurant · Provider · Status · Slots in window · Link
- Each row starts with a spinner in the Status column
- When the row's `result` event arrives:
  - `available` → green badge + comma-separated clickable times (each opens its `bookingUrl` in a new tab)
  - `unavailable` → gray "No tables"
  - `error` → yellow "Check failed" with tooltip + manual provider link
  - `unsupported` or unresolved → "Couldn't resolve" + a Google search link for the display name

**Live counter** at the top: "Checked 12/22 — 3 available."

**No** pagination, filtering, or sorting controls in v1. Rows render in original list order.

## Error handling

- Article fetch fails or returns zero entries → `400 { error }`, UI shows inline error.
- Per-row provider errors never fail the whole run — they land in that row's cell as `error` status.
- SSE connection drop → UI shows "connection lost — retry?" and preserves any completed rows so a retry only re-checks the unfinished ones (nice-to-have; v1 can require a full retry).
- Provider search returns no high-confidence match → `resolveError` populated, row shows as unresolved.

## Testing

- Unit tests for `classify.ts` covering all three input shapes and mixed-content lists.
- Unit tests for `scrape-listicle.ts` using a saved Infatuation HTML fixture (committed under `__fixtures__/`).
- Unit tests for `resolve-venue.ts` with mocked provider search responses.
- Integration test for the API route using mocked provider modules, asserting SSE event order and shape.
- No E2E tests against real providers — they're too flaky under CI.

## Open risks

- **Infatuation markup changes.** The Infatuation-specific extractor is brittle. Mitigation: always fall back to the generic provider-link extractor, and surface "couldn't find restaurants" clearly so the user can paste names instead.
- **Provider search quality.** Resy/OpenTable search by name can return wrong venues for ambiguous names. Mitigation: similarity threshold + city match; false positives land on a wrong-but-real booking page which the user will notice immediately.
- **SevenRooms flakiness.** Expect more `error` statuses here than for Resy/OpenTable. Acceptable for v1.
- **Rate limiting.** Running 20 Resy checks back-to-back can trigger Imperva. The 5-concurrent pool + existing proxy fallback should contain it, but worth watching after launch.
