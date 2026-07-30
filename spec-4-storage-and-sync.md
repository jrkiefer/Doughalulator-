# Phase 4 — Storage & Sync (two Google Sheets)

Goal: everything saves and loads. Generate both Apps Scripts, build the services and offline queue, wire every disabled button, build Settings. Nothing goes online yet — that's phase 5. The owner can't fully test this phase until phase 5's setup, so verify with unit tests on the mapping functions and tell them plainly: "the saving machinery is built; we connect it in the last step."

General rules for BOTH spreadsheets: `Date` (YYYY-MM-DD) always column A · frozen bold header rows · **upsert by date that MERGES** — a save writes only the columns in its payload and never blanks the rest of the row.

## Sheet 1 — "Hot Tomato Dough Log" (exact tabs & columns)
1. **Summary**: Date | Bible Used | Forecast Tonight $ | Current Sales $ | Sales Left $ | Forecast Tomorrow $ | Total Trays To Make | Exact Batches | Chosen (Up/Down) | Batches Made | Shortage?
2. **Dough Count**: Date | Indi Trays | Indi Singles | Indi Have | Small Trays | Small Singles | Small Have | Large Trays | Large Singles | Large Have | Sic Have | Boli Trays | Boli Singles | Boli Have
3. **Sales**: Date | Forecast Tonight (entered) | Forecast Tonight $ | Current Sales (entered) | Current Sales $ | Sales Left $ | Forecast Tomorrow (entered) | Forecast Tomorrow $ | Bible Used | Bible Row Matched Tonight | Bible Row Matched Tomorrow  — when salesLeft was 0 or negative, Bible Row Matched Tonight reads "0" or "0 — flagged".
4. **Use Tonight**: Date | Indi | Small | Large | Sic
5. **Left**: Date | Indi | Small | Large | Sic | Shortages  (clamped values; Shortages = raw negatives as text like "Large -12", blank if none, red)
6. **Need Tomorrow**: Date | Indi | Small | Large | Sic
7. **Make**: Date | Indi Balls | Indi Trays | Small Balls | Small Trays | Large Balls | Large Trays | Sic Balls | Sic Trays | Boli Trays  (pre-batch-adjustment)
8. **Batches**: Date | Total Trays | Batches | Rounded (Up/Down) | Indi | Small | Large | Sic | Boli  (final trays per size after adjustment; Sic in trays; the size columns sum to Batches × 11)
9. **Final Dough**: Date | Indi Trays | Indi Singles | Indi Final | Small Trays | Small Singles | Small Final | Large Trays | Large Singles | Large Final | Sic Final | Boli Trays | Boli Singles | Boli Final  (count + made, from the chosen option)
10. **EON Count**: Date | same per-size trays/singles/have layout as tab 2 | Final Sales (entered) | Final Sales $
11. **EON Check**: Date | Indi | Small | Large | Sic | Trays Short  (text like "Small 2, Sic 1", blank when fine; negatives red)
12. **Actual Use**: Date | AM Sales $ | AM Indi | AM Small | AM Large | AM Sic | AM Boli | PM Sales $ | PM Indi | PM Small | PM Large | PM Sic | PM Boli  (AM columns written at the 2 PM save; PM columns at the EON save — one row per day, filled in two steps by the merge rule)
Plus two read-only reference tabs, **Dough Bible** and **Peach Bible**, mirroring the repo JSON (Sales | Indi | Small | Large | Sic rows + season/notes). The app sends the tables with a content hash; the script rewrites these tabs only when the hash changed. The repo JSON is always what the app calculates from.

## Sheet 2 — "Hot Tomato Temp Log"
- **Overview**: one fixed row per station in walking order: Station | Last Temp | Slot | When (refreshed on every save).
- **Log**: append-only, one row per submitted reading: Date | Time | Slot | Station | Temp — every submission appends, including corrections: full audit trail with clock times.
- **One tab per station** (named exactly as the station): Date | Morning | 2 PM | Night — merge upsert by date; re-entering a slot overwrites the cell while Log keeps the original.

## Apps Scripts — generate `apps-script/dough/Code.gs` and `apps-script/temps/Code.gs`
- `setup()` in each: creates every tab, headers, frozen rows, date formats, red highlights on shortage columns. **Safe to re-run**: adds anything missing (e.g. a new station tab), never touches existing rows.
- `doPost`: verifies a shared secret in the payload. Dough script routes `type: 'day' | 'eon' | 'bibles'`; temps script takes a readings payload (date, slot, time, station values).
- `doGet`: dough — a single date, a range, or recent N days; temps — latest reading per station and a full day's grid; both support a `ping` action for Test Connection. Secret checked on every request.
- Send requests as simple requests (text/plain body containing JSON) — Apps Script web apps don't answer CORS preflight.

## App-side services (`src/services/`)
- Save moments: after the batch choice is tapped (day record), after EON (eon record), after a temps save. Each save also lands in localStorage; on network failure, queue it, show "Saved on phone — will sync", retry on next app open. Status pill reflects SAVED vs UNSYNCED.
- Wire **LOAD FROM SHEET** (pulls that date's records into the form, sets status LOADED), the **AM Use** data path (fetch yesterday's EON), and **LOAD LAST TEMPS** — all via doGet with local-cache fallback.
- **Settings screen** (footer link): dough script URL + secret, temps script URL + secret, a Test Connection button for each. Stored in localStorage.

## Tests
Record → sheet-rows mapping for every tab as pure functions, including: merge semantics (a payload contains only its own columns), the two-step Actual Use fill, the "0 — flagged" cell, the bible-mirror hash gate, temps Log append vs station-tab merge, Overview refresh rows.

**Done means:** tests green; every button in the app is live (network calls will simply fail politely until phase 5 connects them); PROGRESS.md updated; plain-words report; wait for "next".
