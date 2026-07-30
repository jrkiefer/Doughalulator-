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

- **Sizes** — the five dough sizes: **Indi** (individual), **Small**, **Large**, **Sic** (Sicilian), **Boli**.
- **Ball** — one lump of dough, ready to become one pizza.
- **Tray** — a tray of dough balls. Balls per tray: Indi 11, Small 8, Large 6, Boli 6.
- **Singles** — loose balls not on a full tray. **Sicilian is counted as singles only** (no trays in inventory); its *make*-tray holds 3 balls and it is always *displayed* as balls.
- **Boli** — special dough, never in the bible. Rule: always top the count back up to 6 trays.
- **Batch** — one mixer run of dough = 11 trays.
- **Bible** — the lookup table mapping a sales figure to dough needed per size. Regular bible Sept 1 – June 30; **peach bible July 1 – Aug 31** (peach season), chosen by the record's date.
- **Shorthand sales** — sales typed small mean thousands: an entry ≤ 50 is multiplied by 1,000 (2.2 → 2,200; 50 → 50,000); above 50 is literal; 0 stays 0.
- **2 PM session** — the afternoon count + calculation: what we have, what tonight will use, what tomorrow needs, what to make, and the two batch choices (round down / round up — the owner taps one; the engine never picks).
- **salesLeft** — today's forecast − current sales: the selling still to come tonight.
- **EON session** — End Of Night: final count + final sales, and the check against tomorrow's need — all five sizes, Boli against its 36-ball target (0 when closed tomorrow).
- **PM use** — dough used since 2 PM = the night's final dough − EON count. Computed LIVE by the sheet's Dough Use tab (blank until the night has final-dough numbers); negatives render red (miscount).
- **AM use** — dough used before 2 PM = yesterday's EON count − this morning's count. Also computed live by the Dough Use tab; blank when yesterday has no EON record (closed day).
- **Stations** (walking order, for the temps page): Pizza 1, Pizza Lowboy, Pizza 2, Slice, Salad, Reach-In, Walk-In, Freezer.
- **Temp slots** — before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night.

## Design system (final, after two owner-requested revisions)

- **Font** (owner's choice, July 2026): Calibri — served as self-hosted `Carlito` (Google's metric-identical Calibri twin, via Fontsource) with real Calibri preferred where installed. Both `--serif` and `--mono` vars point at it; imported in `src/main.tsx`.
- **One solid background** (owner's choice): the whole page is cream — the original dark bands and torn edges are gone. Cards are the slightly lighter card-cream.
- **Palette** (from the original `design/` screenshots): page cream `#EEE7D7` · card cream `#FBF7EE` · input tint `#F0EADE` · ink `#1E1B14` · accent brick red `#A33E2A` · muted `#7C7263` · sizes: Indi `#3E693C`, Small `#A63B27`, Large `#356EA3`, Sic `#BB527A`, Boli `#733D89`.
- One global stylesheet (`src/styles.css`) of tokens + component classes; no CSS framework. Numbered badges are one global sequence (00 date, 01 sales, 02 counts, 03 day's work, 04 by size, 08 EON outlook, 09 temps, 10 settings).
- The `design/` screenshots were the phase-2 starting point; the owner's later requests (simple clean layout, solid background, Calibri) override them.

## Storage & sync facts (parity build — specs 6–9)

- **No save buttons.** `src/services/sync.ts` is a local-first autosave engine (dependency-injected, fully tested): every edit persists the raw FORM state to the phone (v2-prefixed localStorage via `src/services/local.ts`), a ~2.5 s debounce flushes to the sheets, with online/page-hide/boot retry triggers, per-record ack-hash dedupe, and single-flight flushes.
- **Three-outcome transport** (`src/services/client.ts`, never throws): ok · retryable (offline/timeout/HTTP/lock-busy `retryable:true`) · rejected (script `ok:false` — parks that one record red with the reason, never blocks others, cleared by the next edit). Phone-write failures fall back to memory+network; both failing raises the red "not saved anywhere" state.
- **Blank ≠ zero end to end**: `toNumOrNull` in forms, `Maybe` fields in core, empty cells in payloads (they CLEAR sheet cells), blanks hydrate back as blanks on load.
- Saves are **merge-upserts by Date**; columns depending on the tapped batch choice (Batches, Final Dough, Summary's chosen columns) stay blank until a choice exists. Usage is NOT posted — the sheet's formula-driven **Dough Use** tab computes AM/PM use live, and the 🍕 menu regenerates Theil–Sen **fitted bible** suggestion tabs.
- Two-phone rules: date navigation paints the phone copy then background-fetches the sheet; dirty local wins, clean local is replaced; typing mid-fetch discards the fetch; LOAD FROM SHEET is a force-pull with a dirty double-tap, "Up to date ✓", and a no-row message; RESET is two-tap and blanks only the open date.
- Apps Scripts (`apps-script/*/Code.gs`) are lock-guarded, validate terminally (bad date/empty/nonsense negatives — sales-left and temps may be negative), and match dates tolerantly (ISO, M/D/YYYY, 2-digit years). Backend tests run the real `.gs` files in-process via `apps-script/harness.ts`, including a bible tripwire against `src/data`.
- Settings (script URLs + secrets) stay in localStorage via `src/services/settings.ts`.

## Engine facts worth remembering

- `runDoughCalculation(inputs, bibles, config)` → `DoughDayRecord`; `runEonCalculation(eonInputs, dayRecord | null, bibles, config)` → `EonRecord`. All pure; bibles and config passed in; blank inputs are `null` and stay null.
- Bible lookup: exact row wins; between rows round DOWN below 10,000 and UP at/above (config); outside the range clamp to the nearest end.
- Tomorrow forecast typed 0 = **closed tomorrow**: zero need/make everywhere incl. Boli, no batch choice. Blank tomorrow = unknown, not zero.
- `left` keeps raw negatives; the shortfall is a per-size **set-out** (whole trays) and tomorrow's make = need − left replaces it (dough conserves). salesLeft 0 → use 0; negative → use 0 + `negativeSalesLeft`.
- Boli top-up counts trays AND singles toward 36 balls; the EON check includes Boli vs that target (0 when closed).
- Batch round-down floors at 1 batch when there is dough to make; 40/60 Small/Large adjustment, never below 0, whole delta to the only counted one of the pair.
- `npm run typecheck` / `npm run lint` / `npm test` / `npm run build` are the four gates (all wired into CI). `npm run dev` starts the preview.
