# Phase 1 — Foundation & the Calculation Engine

Goal: project skeleton + the complete dough math as pure, tested functions. No visual app yet. When tests pass, tell the owner in plain words ("the calculator brain is built and passed all N checks") and stop for "next".

## Setup
- Vite + React + TypeScript in this directory; Vitest for tests. No extra frameworks.
- Move `doughBible.json` and `peachBible.json` to `src/data/` unchanged. Move the 4 screenshots to `design/` (used in phase 2).
- Write **CLAUDE.md**: folder rules — `src/core/` pure calculation logic only (no React, no I/O, no `Date.now()` inside; dates/data passed in) · `src/config/` every tunable constant · `src/data/` bibles · `src/features/<feature>/` UI · `src/services/` Sheets clients + offline queue (core never imports services) · every core function tested. Add a domain glossary, plus the working rules and beginner-communication rules from BUILD-PLAN.md.

## The five sizes
Indi, Small, Large, Sicilian (Sic), Boil. Balls per tray: Indi 11, Small 8, Large 6, Boil 6. **Sicilian is counted as singles only** (no trays in inventory). Sic's make-tray size is 3.

## The 2 PM calculation
0. **Shorthand sales.** Every sales input (today's forecast, current sales, tomorrow's forecast, EON final sales) may be shorthand: entered value ≤ 50 means thousands (2.2 → 2,200; 50 → 50,000); above 50 literal; 0 stays 0. Pure `normalizeSales(raw)`. Keep raw AND normalized; all math uses normalized.
1. **Have** per size = trays × ballsPerTray + singles (Sic: singles only).
2. **salesLeft** = today's forecast − current sales.
3. **Tonight's use**: bible lookup on salesLeft → Indi/Small/Large/Sic (Boil never in the bible).
4. **Left** = have − use; clamp at 0 downstream but keep the raw negative as a shortage warning.
5. **Need**: bible lookup on tomorrow's forecast.
6. **Make (balls)** = max(0, need − left).
7. **Trays to make**, rounded UP: Indi ÷ 11, Small ÷ 8, Large ÷ 6, Sic ÷ 3 (Sic is always DISPLAYED as balls).
8. **Boil** skips 3–7: make = max(0, 6 − boilTraysCounted), whole trays only.
9. **Batches**: totalTrays = all trays to make (Sic + Boil included); exactBatches = totalTrays ÷ 11. Compute BOTH options — round down and round up. Each adjusts to batches × 11; the tray difference is absorbed by Small and Large at 40/60 (smallΔ = round(0.4 × delta), largeΔ = remainder; never below 0 trays). There is NO auto pick — the owner taps up or down in the UI; the engine always returns both.
10. **Final dough** per option, per size: finalTraysToMake (post-adjustment), ballsMade (finalTrays × ballsPerTray; Sic = its balls-to-make unchanged; Boil trays × 6), finalDough in count form — trays = counted + made, singles carry over unchanged, total = have + ballsMade (Sic: total only).

`runDoughCalculation(inputs, bibles, config) → DoughDayRecord` holding EVERY input and intermediate: raw + normalized sales, have, salesLeft, bibleUsed, bible rows matched, use, leftRaw/left, need, make, trays, sicBalls, boilTrays, totalTrays, exactBatches, both batch options with final dough, `chosenBatchOption` (null until tapped), flags. Flat, clearly named — humans read it.

## Bible rules
- File shape `{ name, season, notes, rows }`, rows sorted by sales ascending: `{ sales, indi, small, large, sic }`. Peach rows also carry optional `trays`/`batches` reference fields — **the engine ignores them**.
- **Peach bible July 1 – Aug 31** (by the record's date); regular bible Sept 1 – June 30. Explicit override parameter allowed.
- Exact match → that row. Between rows → config rule: DOWN below 10,000, UP at/above — config-driven strategy, trivial to change.
- Below lowest row → lowest row; above highest → highest. (Regular 3,750–20,750; peach 3,000–17,500.)
- **Tonight-lookup special cases:** salesLeft exactly 0 → use 0 for every size. salesLeft NEGATIVE → use 0 for every size AND a `negativeSalesLeft` flag on the record (UI will warn; the Sheet will show "0 — flagged"). Tomorrow's lookup unaffected.

## The EON calculation
- `runEonCalculation(eonInputs, dayRecord | null, config) → EonRecord`: eonHave per size (same counting math), raw + normalized final sales, `pmSales = finalSales$ − currentSales$` (from the day record).
- **Tomorrow check — Indi/Small/Large/Sic only, never Boil:** eonLeft = eonHave − need. Per size, if negative: trays short rounded up (÷ 11/8/6/3; Sic also as balls).
- **PM use, all five sizes:** pmUse = chosen option's finalDough total − eonHave. Do NOT clamp negatives (a negative means a miscount; UI adds a "check count?" hint).
- If dayRecord is null, still compute eonHave + sales; set availability flags. Also support a manually-entered tomorrow's forecast: do the bible lookup (auto bible by date, same rules) to compute need and the check. PM use stays unavailable without the day record.

## AM use
`computeAmUse(yesterdayEonRecord | null, todayHave, currentSales$) → { amSales, amUse per size (all five) } | null`. amUse = yesterday's eonHave − today's have. Null when yesterday's EON doesn't exist (closed days stay blank). Negatives pass through as-is. The 2 PM flow calls this; the service layer will supply yesterday's EON later.

## Config (`src/config/`)
Typed objects: ballsPerTray per size · sicMakeTraySize 3 · boilTargetTrays 6 · traysPerBatch 11 · salesShorthand { maxShorthand 50, multiplier 1000 } · bible roundingRule { threshold 10000, below 'down', atOrAbove 'up' } · peachSeason dates · batchAdjustSplit { small .4, large .6 } · bible display names ("Bible '26", "Peach '24") · stations list in walking order: Pizza 1, Pizza Lowboy, Pizza 2, Slice, Salad, Reach-In, Walk-In, Freezer · temp slots Morning / 2 PM / Night with clock boundaries (before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night).

## Tests (all pure core functions), including:
shorthand (2.2→2200, 50→50000, 51→51, 0→0) · exact row · between rows both sides of 10k · below/above range · salesLeft 0 → use 0 · negative salesLeft → use 0 + flag · shortage clamp + warning · make clamp · Sic singles-only · Boil ≥ 6 trays · totalTrays divisible by 11 · batch split incl. a round-down negative delta and the never-below-0 guard · final dough trays/singles/totals for both options · EON check with Boil excluded + per-size trays short (incl. Sic ÷ 3 and balls) · pmSales from shorthand final sales · pmUse all five sizes incl. negative passthrough · computeAmUse with and without yesterday's EON, incl. a negative · EON with null dayRecord + manual forecast path · one end-to-end worked example per session type using REAL bible rows, hand-computed and commented step by step.

**Done means:** `npm test` green; CLAUDE.md and PROGRESS.md exist; plain-words report to the owner; wait for "next".
