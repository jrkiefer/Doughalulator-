# CLAUDE.md — Doughalulator

A dough-planning app for a pizzeria. Read this before touching anything.

## Who you're working with (follow this in every session)

The owner of a pizzeria. ZERO coding knowledge — treat them like a smart kid:

- Plain words only; if a technical word is unavoidable, explain it in the same breath ("a repo — the online folder holding your app").
- Do everything yourself that you possibly can. Involve them only when a step truly needs their hands: signing into accounts, clicking in Google or GitHub, approving permissions.
- When you need them: ONE step at a time, exactly what to click or type, then WAIT for "done".
- Never show code or raw errors expecting understanding — say what it means and what you're doing about it.
- If the computer is missing something you need (like Git), stop and walk them through installing it the same gentle way.
- Guiding principle for every decision: **clean seams and ruthless simplicity. When in doubt, build less.**

## How to work (prevents overload — follow it exactly)

1. The build is five phases. The spec for each lives in its own file in the repo root. **Read ONLY the current phase's spec file** (plus this file and PROGRESS.md) — do not read ahead.
2. Finish a phase completely: build it, run the tests, fix until green.
3. After each phase: update **PROGRESS.md**, then tell the owner in plain words what just got finished and what it means, and ask them to say **"next"** before starting the following phase.
4. If a chat gets very long, or anything resets: it's safe. A fresh session should read BUILD-PLAN.md + PROGRESS.md + CLAUDE.md and continue from the first unfinished phase.

## Folder rules

- `src/core/` — pure calculation logic ONLY. No React, no I/O, no `Date.now()` inside; dates and data are passed in as arguments. Every core function is tested.
- `src/config/` — every tunable constant (balls per tray, batch size, season dates, rounding rules, station list…). Change numbers here, never in core.
- `src/data/` — the two bibles (`doughBible.json`, `peachBible.json`). Real data — **never alter a number**.
- `src/features/<feature>/` — UI, one folder per page/feature (phase 2+).
- `src/services/` — Google Sheets clients + the offline queue (phase 4). **Core never imports services.**
- `design/` — the 4 design screenshots, ground truth for looks (phase 2).

## Domain glossary

- **Sizes** — the five dough sizes: **Indi** (individual), **Small**, **Large**, **Sic** (Sicilian), **Boil**.
- **Ball** — one lump of dough, ready to become one pizza.
- **Tray** — a tray of dough balls. Balls per tray: Indi 11, Small 8, Large 6, Boil 6.
- **Singles** — loose balls not on a full tray. **Sicilian is counted as singles only** (no trays in inventory); its *make*-tray holds 3 balls and it is always *displayed* as balls.
- **Boil** — special dough, never in the bible. Rule: always top the count back up to 6 trays.
- **Batch** — one mixer run of dough = 11 trays.
- **Bible** — the lookup table mapping a sales figure to dough needed per size. Regular bible Sept 1 – June 30; **peach bible July 1 – Aug 31** (peach season), chosen by the record's date.
- **Shorthand sales** — sales typed small mean thousands: an entry ≤ 50 is multiplied by 1,000 (2.2 → 2,200; 50 → 50,000); above 50 is literal; 0 stays 0.
- **2 PM session** — the afternoon count + calculation: what we have, what tonight will use, what tomorrow needs, what to make, and the two batch choices (round down / round up — the owner taps one; the engine never picks).
- **salesLeft** — today's forecast − current sales: the selling still to come tonight.
- **EON session** — End Of Night: final count + final sales, the check against tomorrow's need (never Boil), and PM use.
- **PM use** — dough used since 2 PM = chosen option's final dough − EON count. Negatives mean a miscount ("check count?").
- **AM use** — dough used before 2 PM = yesterday's EON count − this morning's count. Blank when yesterday has no EON record (closed day).
- **Stations** (walking order, for the temps page): Pizza 1, Pizza Lowboy, Pizza 2, Slice, Salad, Reach-In, Walk-In, Freezer.
- **Temp slots** — before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night.

## Design system (phase 2 — final choices)

- **Fonts** (self-hosted via Fontsource, no network fetch): headings/hero numerals `Fraunces Variable` (opsz + italic); labels/buttons/inputs/data `Space Mono`. Imported in `src/main.tsx`.
- **Palette** (sampled from `design/` screenshots, defined as CSS variables in `src/styles.css`): page cream `#EEE7D7` · card cream `#FBF7EE` · input tint `#F0EADE` · ink `#1E1B14` · dark band `#121008` · accent brick red `#A33E2A` · muted `#7C7263` · sizes: Indi `#3E693C`, Small `#A63B27`, Large `#356EA3`, Sic `#BB527A`, Boil `#733D89`.
- One global stylesheet (`src/styles.css`) of tokens + component classes; no CSS framework. Dark bands use a clip-path torn edge. Numbered badges are one global sequence (00 date, 01 sales, 02 counts, 03 day's work, 04 by size, 05 AM use; 08 EON outlook and 09 temps arrive later per the screenshots).

## Engine facts worth remembering

- `runDoughCalculation(inputs, bibles, config)` → `DoughDayRecord`; `runEonCalculation(eonInputs, dayRecord | null, bibles, config)` → `EonRecord`; `computeAmUse(yesterdayEon | null, todayHave, currentSales$)`. All pure; bibles and config are always passed in.
- Bible lookup: exact row wins; between rows round DOWN below 10,000 and UP at/above (config); outside the range clamp to the nearest end.
- salesLeft 0 → tonight's use is 0 everywhere; negative → use 0 + `negativeSalesLeft` flag.
- Batch tray adjustment is absorbed by Small and Large at 40/60, never below 0 trays.
- `npm test` runs the whole suite (Vitest). `npm run dev` starts the preview.
