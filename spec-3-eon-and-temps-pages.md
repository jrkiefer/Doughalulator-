# Phase 3 — The EON Page & the Station Temps Page

Goal: the remaining two modes, reusing phase 2's components and design system exactly. End with a preview walkthrough of both pages, then wait for "next". (Save / LOAD LAST TEMPS wiring lands in phase 4 — buttons present, disabled note for now.)

## EON page (second screenshot)
- **01 End of Night Sales** ("DOLLARS"): Final Sales field, shorthand hint applies.
- **02 Current Dough Counts** ("CLOSING COUNT"): same card layout as 2 PM.
- **08 EON Outlook** ("HAVE VS TOMORROW'S NEED"):
  - With the day's 2 PM record: a big verdict — green "Covered for tomorrow" when every checked size is ≥ 0, otherwise red listing each short size with trays short (Sic also in balls). Boli is never part of the check.
  - Below the verdict: PM Sales and the PM Use table (all five sizes; negatives shown as-is with a small "check count?" hint).
  - With NO 2 PM save for this date: show a Tomorrow's Forecast field labeled "No 2 PM save — enter manually"; compute Need via the engine's manual path and render the check. The PM Use area alone shows "needs today's 2 PM save".
- **Dough Bible viewer** at the bottom, same as 2 PM.

## Station Temps page (third screenshot)
- **09 Station Temps** ("°F · 3× DAILY").
- Slot chips **Morning / 2 PM / Night**, the current one auto-suggested by the clock (config boundaries), any tappable.
- One row per station in walking order (from config), each a large input with a right-aligned °F suffix. Inputs accept decimals and NEGATIVES (the freezer). Empty stations are simply skipped.
- **LOAD LAST TEMPS** button under the list (wired in phase 4): on tap only, fills each field with that station's most recent reading and shows a small note of when those readings are from — whatever is in the fields is what saves. Never fills automatically.

**Done means:** all three modes navigable and matching the screenshots; tests green; PROGRESS.md updated; plain-words report; wait for "next".
