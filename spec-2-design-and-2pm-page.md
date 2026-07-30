# Phase 2 — The Design System & the 2 PM Page

Goal: the app shell styled exactly like the screenshots in `design/`, with the 2 PM page fully working against the engine. End by starting the preview and inviting the owner to tap through with sample numbers before saying "next". (Saving/loading buttons appear but stay disabled with a small "coming in a later step" note — storage is phase 4.)

**The screenshots are ground truth for looks — study them first and sample exact colors from them. This text is ground truth for behavior.**

## Design language
- **Identity:** "Dough Tracker" — "Dough" dark roman serif, "Tracker" deep-red italic serif.
- **Type:** editorial serif display face with a true italic for headings and hero numbers (Fraunces or the closest Google Fonts match to the screenshots) + a monospace utility face (Space Mono or closest) for labels, buttons, inputs, and data — labels uppercase and letter-spaced. Record final choices in CLAUDE.md.
- **Palette:** warm cream background, slightly lighter cream cards, near-black ink, deep brick red accent (title italic, hero batch numeral, AUTO micro-label). Size colors as thick left card borders + dot bullets: Indi green, Small brick red, Large blue, Sic magenta, Boli purple.
- **Page bands:** alternating cream and near-black bands with angled torn-edge transitions, as in the screenshots.
- **Components:** soft-rounded cards · pill buttons (outline = inactive, solid black = active) · big solid-black primary buttons · dashed dividers · numbered badge chips (00, 01, 02 … one global sequence across the whole app) · large tinted rounded inputs, big touch targets, right-aligned unit suffixes · computed values inline in bold · red "AUTO" micro-label ONLY on the bible toggle.
- Mobile-first; used at arm's length in a kitchen at night.

## App shell (shared by all three modes)
- Navigation: a **STATION TEMPS** bar above a **2 PM | EON** two-tab segment. Each mode is one scrolling page.
- Header: status pill top-left (NEW NIGHT → LOADED → SAVED → UNSYNCED), **RESET** top-right (confirm, clears the form), title, then **00 Active Date**: the date (default today, editable) + a big **LOAD FROM SHEET** button — this is the history feature (wired in phase 4; disabled note for now).
- Footer: version tag from package.json + a small Settings link (screen built in phase 4).

## The 2 PM page
- **Bible row:** "DOUGH BIBLE / AUTO" with the two config-named pills ("Bible '26" / "Peach '24"). Auto-selected by the record's date with the AUTO tag showing; tapping a pill overrides for this record.
- **01 Sales & Forecast** (hint "10 = $10,000"): Today's Forecast, Current Sales, computed **Sales Left Tonight** inline, Tomorrow's Forecast. Decimal keypad. If the negative-salesLeft flag fires, show the warning: "Current sales are past tonight's forecast — check your numbers."
- **02 Current Dough Counts** ("TRAYS + SINGLES"): color cards with live "= N balls" — Individual "11 / tray", Small "8 / tray", Large "6 / tray" (Trays + Singles each), Sicilian "balls only" (one Balls field), Boli Dough "target 36 · 6 / tray" (Trays + Singles). Integer keypads.
- **03 The Day's Work** ("TRAYS TO MAKE"): tray pills per size (SIC pill in balls). Until inputs are complete: "Set sales and both forecasts to get the batch count." When complete: show the exact figure ("4.7 batches · 52 trays") and "Tap Round up or Round down." On tap: the big red batch numeral ("5 batches to make"), PLANNED vs MAKING trays (batches × 11), and a status chip ("even · 55 trays = 5 batches" / "rounded up from 52"). The Round up / Round down pills start UNSELECTED every time; **Save stays disabled until one is tapped.**
- **04 By Size** ("TONIGHT → EON → TOMORROW"): rows Indi/Sm/Lg/Sic with columns HAVE | USE | LEFT | NEED | MAKE | TRAYS (Sic's TRAYS cell displays balls, labeled BALLS; shortages red with the raw negative). Separate Boli row: HAVE | TARGET 36 | MAKE, "whole trays only".
- **AM Use block:** appears automatically when yesterday's EON exists (data arrives in phase 4; build the component now against the engine's shape, hidden until data exists) — AM sales + per-size use, negatives shown with a "check count?" hint.
- **Dough Bible viewer** at the bottom: "Dough Bible — TAP TO EXPAND" collapsible rendering the ACTIVE bible's table read-only.

**Done means:** preview running; the owner can type a full pretend night and watch every number appear; visuals match the screenshots side by side at phone width; tests still green; PROGRESS.md updated; plain-words report; wait for "next".
