# Spec 7 — Autosave, Sync Engine & Two-Phone Rules

Save buttons are gone. The engine (`src/services/sync.ts`, dependency-injected and fully tested) is local-first:

## Saving

- Every keystroke/tap updates the in-memory record, stamps `updatedAt`, and persists the raw form state to phone storage (guarded — a full phone can never crash an edit).
- A ~2.5 s trailing debounce triggers a flush. A flush sends only records whose `updatedAt` beats their `syncedAt`, in order day → EON → temps, single-flight, with a per-record ack-hash so identical content is never resent. Empty records never post.
- Retry triggers: the debounce; the `online` event; page-hide/`pagehide` (fire-and-forget keepalive, **never** marked synced client-side); and app boot (dirty records from earlier sessions resend).

## Three-outcome transport

`postJson`/`getJson` never throw: **ok** · **retryable** (offline, timeout, HTTP transport, script lock busy via `retryable: true`) · **rejected** (the script said `ok:false` — bad secret, validation refusal). Retryable keeps records dirty for the next trigger. Rejected parks that ONE record with the server's reason (red status), never blocks other records/types, and clears on the next edit.

## Phone-storage failure (§3e, owner-specified)

Phone write fails → keep the record in memory and send to the sheet anyway. Sheet ok → "SYNCED — NOT ON PHONE" (informational). Both fail → red "NOT SAVED ANYWHERE — keep the app open and get back online", cleared the moment either store succeeds.

## Status set

new · saved on phone (debounce pending) · syncing · synced · offline — will retry · sheet refused (red, with reason) · not saved anywhere (red). Surfaced in the header dot + label; per-field ✓ chips appear when a field holds a value and the record is synced.

## Two-phone + load rules

- Date navigation/app open: the phone copy paints instantly; the sheet is fetched behind it. A **dirty** local record wins ("phone copy kept — tap LOAD to pull the sheet"); a clean/blank one is replaced silently. Typing during the fetch discards the fetched record (per-date edit sequence guard).
- LOAD FROM SHEET is a force-pull with a dirty check: unsynced edits require a second confirming tap; an identical sheet copy answers "Up to date ✓"; a missing row says so.
- RESET is two-tap, blanks only the open date (no date jump), resets synced-at so an empty record never posts, and clears the cache entry so the next load re-pulls the sheet.
