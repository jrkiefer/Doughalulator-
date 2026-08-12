# CLAUDE.md — Doughalulator

A live dough-planning app for a pizzeria, in daily use. Read this before touching anything.
`README.md` is the owner-facing companion — the plain-words account of the app, the two Google
notebooks and every folder here. Keep both true.

## Who you're working with (follow this in every session)

The owner of a pizzeria. ZERO coding knowledge — treat them like a smart kid:

- Plain words only; if a technical word is unavoidable, explain it in the same breath ("a repo — the online folder holding your app").
- Do everything yourself that you possibly can. Involve them only when a step truly needs their hands: signing into accounts, clicking in Google or GitHub, approving permissions.
- When you need them: ONE step at a time, exactly what to click or type, then WAIT for "done".
- Never show code or raw errors expecting understanding — say what it means and what you're doing about it.
- If the computer is missing something you need (like Git), stop and walk them through installing it the same gentle way.
- Guiding principle for every decision: **clean seams and ruthless simplicity. When in doubt, build less.**

## How to work

1. **Work directly on `main`** (owner's explicit choice, July 2026): commit there and
   `git push origin main` — no feature branches, no pull requests unless the owner asks. The deploy
   workflow re-runs lint + tests + build on every push and publishes only green builds, so a bad
   push cannot take down the live site.
2. Never push with a failing gate: `npm run typecheck && npm run lint && npm test && npm run build`.
3. Finish work completely, keep the tests green, update the version history in `README.md`, then
   tell the owner in plain words what changed.
4. If a chat gets long or anything resets, it's safe: read `CLAUDE.md` and `README.md` and carry on.
   **If the working tree looks stale or wrong, `git fetch origin && git checkout -B main origin/main`
   — the remote is the source of truth.** (Container resets have landed the checkout on an old
   branch more than once; nothing is ever lost, it just needs restoring.)
5. Two documents, and only two: this file and `README.md`. Don't add more markdown to the repo —
   put the knowledge in whichever of these two owns it.

## Folder rules

- `src/app/` — the shell. `App.tsx` is the screen only; `engine.ts` is the composition root that
  wires the pure engine to real storage, network and clock; `main.tsx` is the entry; `styles.css`
  is the whole design system.
- `src/core/` — pure calculation logic ONLY. No React, no I/O, no `Date.now()` inside; dates and
  data are passed in as arguments. Every core function is tested.
- `src/config/` — every tunable constant (balls per tray, batch size, season dates, rounding rules,
  station list…). Change numbers here, never in core.
- `src/data/` — the two bibles (`doughBible.json`, `peachBible.json`) plus `bibles.ts`, the single
  place that loads them. Real data — **never alter a number**.
- `src/features/<feature>/` — UI, one folder per page or piece.
- `src/services/` — Google Sheets clients, transport, phone storage, the sync engine, the mapping
  layer. **Core never imports services.**
- `apps-script/` — `dough/Code.gs` and `temps/Code.gs` are the real code inside the two
  spreadsheets; `test/` holds the in-process fake Google that runs those exact files.
- `design/` — the four original screenshots. They are the record of layout and wording only; the
  visual ground truth is now the token block at the top of `src/app/styles.css`.

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
- **PM use** — dough used since 2 PM = the chosen option's final dough − EON count. Computed by the app (`pmUse` on `EonRecord`); a count that ROSE reads blank, not negative — that means a miscount.
- **AM use** — dough used before 2 PM = yesterday's EON count − this morning's count, via `computeAmUse`. Blank when yesterday has no EON record (a closed day).
- **Stations** (walking order, for the temps page): Pizza 1, Pizza Lowboy, Pizza 2, Slice, Salad, Reach-In, Walk-In, Freezer.
- **Temp slots** — before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night.

## Design system (v1.5.0 — ported from the owner's other app)

- **The tokens at the top of `src/app/styles.css` are the ground truth.** Palette: page `--bg
  #f3ece0`, cards `--paper #fbf7ee`, fields `--input #f1eadb`, ink `#1f1b15`, accent (burnt red)
  `#b3321b`; sizes Indi `#2f6b3a`, Small `#b3321b`, Large `#1b6fa8`, Sic `#c94a7a`, Boli `#7a3b8e`.
- **Type:** Fraunces (headings, the batch numeral), Inter Tight (words), JetBrains Mono (every
  figure and micro-label) — self-hosted latin subsets via Fontsource, imported in `src/app/main.tsx`.
  No CDN.
- **One flat background, and it must stay that way.** `--bg` is painted on `html`, `body` and
  `.page`, with `color-scheme: light` declared on `html` and in `index.html`. Without that
  declaration a phone's auto-dark-theme inverts bands of the page — that is what the black strips
  were. No gradients anywhere.
- One global stylesheet of tokens + component classes; no framework, and **no inline `style=`
  except to pass a `--size` value**. Numbered badges are one global sequence (00 date, 01 sales,
  02 counts, 03 day's work, 04 by size, 08 EON outlook, 09 temps, 10 settings).

## Storage & sync facts

- **No save buttons.** `src/services/sync.ts` is a local-first autosave engine (dependency-injected,
  fully tested): every edit persists the raw FORM state to the phone (v2-prefixed localStorage via
  `src/services/local.ts`), a debounce flushes to the sheets, with online / page-hide / boot retry
  triggers, per-record ack-hash dedupe and single-flight flushes. `src/app/engine.ts` is where it
  gets its real dependencies.
- **Three-outcome transport** (`src/services/client.ts`, never throws): ok · retryable
  (offline/timeout/HTTP/lock-busy) · rejected (script `ok:false` — parks that one record red with
  the reason, never blocks others, cleared by the next edit). Phone-write failures fall back to
  memory + network; both failing raises the red "not saved anywhere" state.
- **Blank ≠ zero end to end**: `toNumOrNull` in forms, `Maybe` in core, empty cells in payloads
  (they CLEAR sheet cells), blanks hydrate back as blanks on load.
- Saves are **merge-upserts by Date**. Columns depending on the tapped batch choice stay blank
  until a choice exists.
- **The app is the only calculator.** The Dough Log holds no formulas — every number is worked out
  here and written into place. The one exception is the self-building bible: the app appends each
  finished night to `New Bieblerb` / `New Peach Bieblerb` and the script refits a Theil–Sen line
  through the whole history after every EON save. Nights with no takings are excluded.
- **No secrets** (v1.4.0, owner's explicit request). Settings holds one `/exec` URL per notebook via
  `src/services/settings.ts`. Because of that, `wipe`/`retire` are NOT reachable over HTTP — erasing
  is the guarded **Erase all data** item in each spreadsheet's own menu. A test asserts the scripts
  refuse those types over the web. Treat the `/exec` addresses as semi-public.
- Two-phone rules: date navigation paints the phone copy then background-fetches the sheet; dirty
  local wins, clean local is replaced; typing mid-fetch discards the fetch; LOAD FROM SHEET is a
  force-pull with a dirty double-tap; RESET is two-tap and blanks only the open date.

## Things a review already found — don't reintroduce them

- **A total summed from `?? 0` is not the same as an answer.** `totalTrays` stays `null` until at
  least one size is counted: with every size contributing zero, "nothing to make" reads as a
  finished decision when the truth is "nobody has counted yet". Any new roll-up needs the same care.
- **A sheet fetch must clear what it speaks for before applying** (`takeFromSheet` in
  `services/sync.ts`, `DOUGH_SHEET_RECORDS` in `app/engine.ts`). The fetch only writes back records
  the sheet actually holds, so without clearing, a record the sheet lacks survives on screen *and*
  gets stamped synced. Temps are excluded on purpose — different notebook.
- **`mirrorBibles()` runs at boot for a reason.** `refreshBibleBuild()` gives up silently when a
  bible mirror tab is empty, so without a re-send the self-building bible would just stop after an
  Erase all data. The script no-ops on an unchanged hash.
- **Setup mistakes must be told, not retried.** A typo'd address, a 404, or an HTML page instead of
  JSON are all `rejected` with plain-words reasons — retrying those forever just shows
  OFFLINE — WILL RETRY and teaches the owner nothing.

## Two Google rules learned the hard way — do not relearn them

1. **A tab name is capped at 31 characters.** Google truncates longer ones, and two names that
   truncate alike collide silently: the second tab quietly becomes `Sheet2` and everything written
   to it vanishes. That cost an entire rebuild. `makeTab()` now throws if Google hands back a
   different name than asked for, and a test asserts every name fits.
2. **`getValues()` returns real `Date` objects** from date-formatted columns, not the text that was
   written. Anything matching rows by date must go through `normalizeDate`, which handles all three
   shapes — matching on the raw value silently appends a duplicate row on every save instead of
   merging. The test harness models this quirk deliberately, so the bug fails loudly.

## Engine facts worth remembering

- `runDoughCalculation(inputs, bibles, config)` → `DoughDayRecord`;
  `runEonCalculation(eonInputs, dayRecord | null, bibles, config)` → `EonRecord`;
  `computeAmUse(yesterdayEonHave, todayHave, amSales)` → `AmUse`. All pure; bibles and config are
  always passed in; blank inputs are `null` and stay null.
- Bible lookup: exact row wins; between rows round DOWN below 10,000 and UP at/above (config);
  outside the range clamp to the nearest end.
- Tomorrow forecast typed 0 = **closed tomorrow**: zero need/make everywhere including Boli, no
  batch choice. Blank tomorrow = unknown, not zero.
- `left` keeps raw negatives; the shortfall is a per-size **set-out** (whole trays) and tomorrow's
  make = need − left replaces it (dough conserves). salesLeft 0 → use 0; negative → use 0 +
  `negativeSalesLeft`.
- Boli top-up counts trays AND singles toward 36 balls; the EON check includes Boli vs that target.
- Batch round-down floors at 1 batch when there is dough to make; 40/60 Small/Large adjustment,
  never below 0, whole delta to the only counted one of the pair.
- `npm run dev` starts the preview. The four gates are wired into CI.

**Owner-chosen defaults (don't change without asking):**
1. The EON check INCLUDES Boli against its 36-ball target (0 on a closed tomorrow).
2. Night temps slot stays "after 17:00".
3. Sheet columns depending on the tapped batch choice stay blank until a choice is tapped.
4. Sicilian EON shortfalls report at full strength (no clamp, no minimum).
