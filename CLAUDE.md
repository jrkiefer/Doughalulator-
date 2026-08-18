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
- `src/features/<feature>/` — UI, one folder per page or piece. `graphs/` is the only one that
  draws: a hand-rolled SVG, no charting library, no CDN. Its geometry lives in `chartMath.ts`
  (pure, tested) so the curve's one guarantee is provable rather than eyeballed: the smoothing
  is **monotone cubic**, which cannot overshoot between two thresholds — an ordinary spline
  draws dough no threshold asks for and dips below zero at the bottom end.
- **The Graphs drawer stays SIMPLE (owner's choice, Aug 2026).** A Gap view, a Table view and a
  one-sentence summary were built, shipped in v1.18.0, and removed at the owner's ask in
  v1.19.0 — one chart, the pill rows and the tap readout are the whole surface. Don't re-add
  views to this card without being asked. (For the record, should a diverging view ever come
  back: red/green measured ΔE 7.2 under colour blindness — use red/blue at 21.2.)
- **The graph's two lines were re-coloured against a measured floor, not by eye** (v1.17.0).
  The reference line is `--ink`, NOT `--ink-mute`: against the warm size hues the grey scored
  ΔE 11.9–14.8 for ordinary colour vision (floor 15) and as low as 5.2 for colour-blind readers
  (floor 8) — three of five views genuinely unreadable. `--ink` scores 26.8 worst case. If a
  size hue ever changes, re-run the check before shipping; don't re-pick by taste.
- `src/services/` — Google Sheets clients, transport, phone storage, the sync engine, the mapping
  layer, and `sheets.ts` (the two `/exec` addresses). **Core never imports services.**
- `apps-script/` — `dough/Code.gs` and `temps/Code.gs` are the real code inside the two
  spreadsheets; `test/` holds the in-process fake Google that runs those exact files.
- `design/` — the four original screenshots. They are the record of layout and wording only; the
  visual ground truth is now the token block at the top of `src/app/styles.css`.

## Domain glossary

- **Sizes** — the five dough sizes: **Indi** (individual), **Small**, **Large**, **Sic** (Sicilian), **Boli**.
- **Ball** — one lump of dough, ready to become one pizza.
- **Tray** — a tray of dough balls. Balls per tray: Indi 11, Small 8, Large 6, Boli 6.
- **Singles** — loose balls not on a full tray. **Sicilian is counted as singles only** (no trays in inventory); its *make*-tray holds 3 balls and it is always *displayed* as balls.
- **Sicilian never goes negative same-day** (owner's rule, Aug 2026): it is never set out and used the same day, so it simply runs out. Its `left` floors at 0, it is never in `setOutTrays`/`shortageSizes`, and tomorrow's make is the plain need — NOT the need plus a shortfall that was never covered. Every other size still sets out and still replaces its shortfall. The EON outlook clamps it the same way, for the same reason — being short of TOMORROW cannot mean dipping into same-day dough, which is what its summary line describes.
- **Boli** — special dough, never in the bible. Rule: always top the count back up to 6 trays.
- **Batch** — one mixer run of dough = 11 trays.
- **Bible** — the lookup table mapping a sales figure to dough needed per size. Regular bible Sept 1 – June 30; **peach bible July 1 – Aug 31** (peach season), chosen by the record's date.
- **Shorthand sales** — sales typed small mean thousands: an entry **under 100** is multiplied by 1,000 (2.2 → 2,200; 99 → 99,000); 100 and above is literal; 0 stays 0. (v1.13.0 — matched to the owner's other app, which has always used this cutoff.)
- **2 PM session** — the afternoon count + calculation: what we have, what tonight will use, what tomorrow needs, what to make, and the batch count (the remainder rule settles round down / round up on its own; the pills override it).
- **salesLeft** — today's forecast − current sales: the selling still to come tonight.
- **EON session** — End Of Night: final count + final sales, and the outlook against tomorrow's need — all five sizes, Boli against its 36-ball target (0 when closed tomorrow).
- **EON outlook** (`record.outlook`, ported from the owner's other app so the two match): per size, `diff` = have − need in balls and `trays` = the NEAREST tray, signed — `sign(diff) × round(|diff| ÷ perTray) || 0`, where the `|| 0` kills the `-0` a sub-tray shortage would otherwise produce. Sicilian is balls-only on screen and clamped at 0. **PM sales is still computed and still written to the sheet, it is just not drawn** — the owner asked for the display gone, not the number.
- **Tomorrow's forecast on the EON page overrides the 2 PM one.** The box shows the afternoon's figure until something is typed; a typed figure wins (`needSource: 'manualForecast'`), and clearing it hands back.
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
  02 counts, 03 day's work, 04 by size, 08 EON outlook, 09 temps).

## Storage & sync facts

- **No save buttons.** `src/services/sync.ts` is a local-first autosave engine (dependency-injected,
  fully tested): every edit persists the raw FORM state to the phone (v2-prefixed localStorage via
  `src/services/local.ts`), a debounce flushes to the sheets, with online / page-hide / page-show /
  boot retry triggers, per-record ack-hash dedupe and single-flight flushes. `src/app/engine.ts` is
  where it gets its real dependencies.
- **A failed send has a clock behind it** (v1.10.0): a network-class failure arms a backoff ladder —
  10s doubling to a 5-minute ceiling — cleared the moment any send succeeds. A *rejection* never
  gets one (retrying a refusal teaches nobody anything), and a keepalive flush neither arms nor
  clears it. `offlineTargets` is per NOTEBOOK, so an unreachable temp log cannot make the dough log
  read OFFLINE.
- **`action: 'bibles'`** (`readBibleBuilds` in `dough/Code.gs`) is the only read that reaches the
  `New Bieblerb` tabs — `loadTabIndex()` walks `TABS`, which excludes them and the bible mirrors.
  It pairs each threshold's current value with its suggestion. A size under the three-night gate
  is written `''` up there and MUST come back `null`: `Number('')` is 0, which would draw a
  suggestion of "make none" instead of "nothing to suggest yet". Adding a read action needs the
  owner to paste the script in and **update the EXISTING deployment** — a new deployment mints a
  new `/exec` address and the app loses the sheet on the spot.
- **`getLastRow()` counts content in ANY column**, so a stray note far down a sheet would push the
  next append past a gap of blank rows. `upsertRow` appends after the last row with a DATE in
  column A, worked out from the block it has already read.
- **`Check the log`** (Dough Tools menu, `checkLog`/`logProblems` in `dough/Code.gs`) reports in
  plain words what nothing else would notice: a moved heading, a day with more than one row (the app
  reads only the first, so the rest are invisible to it), and date cells it cannot read. Read-only —
  it writes nothing and adds no tab. Read-after-write verification was considered here and
  deliberately skipped: once the date match is timezone-safe and the headings are verified, its
  extra catch is small and it doubles the Sheets calls on every save.
- **Dates older than `KEEP_DAYS` (90) are dropped from the phone at boot** — but only when every
  record on them is confirmed and unrejected. `datesToPrune` is pure and tested; only the storage
  walk around it isn't, because vitest runs in `node` with no localStorage.
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
- **No secrets** (v1.4.0, owner's explicit request), and since v1.12.0 **no Settings page either**:
  both `/exec` addresses are constants in `src/services/sheets.ts`. A per-device Settings page meant
  a wiped phone silently lost its connection and read "can't reach the spreadsheet" — which is
  exactly what happened to the owner's phone in Aug 2026. Built in, every device is already
  connected. **The addresses are therefore PUBLIC** — public repo, public site — so anyone who finds
  them can read or write those notebooks. The owner was told this plainly and chose it; do not
  re-litigate it, and do not treat the addresses as though they were secret. Erasing stays
  unreachable over HTTP (the guarded **Erase all data** menu item), so the worst case is snooping or
  mess, not destruction. A test asserts the scripts refuse erase types over the web.
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
- **A fetch's bible must fall back to the EON record's own.** On a night with no 2 PM record there
  is no day-record bible, and `eonRecordToTabWrites` picks the self-building bible tab from it —
  getting that wrong files a peach night under the regular bible, silently. Every test but one
  passes the bible explicitly, so the undefined path needs its own.
- **A keepalive flush confirms nothing, and must not be allowed to say otherwise.** It fires into a
  page that is going away and never hears back, so it may not mark a record synced (it already
  didn't), may not clear the offline flags, and may not stand down a pending retry. Any new
  post-flush bookkeeping needs the same `if (!opts.keepalive)` guard.
- **Setup mistakes must be told, not retried.** A typo'd address, a 404, or an HTML page instead of
  JSON are all `rejected` with plain-words reasons — retrying those forever just shows
  OFFLINE — WILL RETRY and teaches the owner nothing. Note `new URL('htps://…')` PARSES: a shape
  check alone waves a bad scheme through to fail at the network, which reads as network-class and
  (since v1.10.0) repeats on the ladder for ever. `addressProblem()` in `services/client.ts` guards
  both verbs — https anywhere, http only against localhost so the app can be tested.

## Five Google rules learned the hard way — do not relearn them

1. **A tab name is capped at 31 characters.** Google truncates longer ones, and two names that
   truncate alike collide silently: the second tab quietly becomes `Sheet2` and everything written
   to it vanishes. That cost an entire rebuild. `makeTab()` now throws if Google hands back a
   different name than asked for, and a test asserts every name fits.
2. **`getValues()` returns real `Date` objects** from date-formatted columns, not the text that was
   written. Anything matching rows by date must go through `normalizeDate`, which handles all three
   shapes — matching on the raw value silently appends a duplicate row on every save instead of
   merging. The test harness models this quirk deliberately, so the bug fails loudly.
3. **The spreadsheet's timezone is NOT the script project's** (v1.14.0). A date-only cell holds
   midnight *in the sheet's* zone; asking the `Date` object for `getFullYear/getMonth/getDate`
   answers in the *script's* zone, so a sheet running AHEAD of the script reads every date as the
   day before. The damage is not a wrong date on screen: the incoming payload's date is a plain
   STRING (never shifted) while the stored cell is a Date (shifted), so `upsertRow` stops
   recognising its own row and appends a fresh one on EVERY save, in silence. `normalizeDate` in
   `dough/Code.gs` therefore renders Date objects with `Utilities.formatDate(value, ssTimeZone(),
   'yyyy-MM-dd')`. A sheet running BEHIND the script is naturally safe, which is exactly why this
   hides. `temps/Code.gs` needs no such fix and must not be "corrected" into one: it matches dates
   on `getDisplayValues()`, so it never sees a Date object at all.
4. **Nothing but `assertHeaders` ever checks the columns are where the app thinks.** Every write maps
   a column NAME to a POSITION from this script's own header list; `validateSave` compares the
   payload against that same list, so both sides of that check are the app. `upsertRow` reads its
   block from **row 1, not row 2** — the same single `getRange`, no extra call — and refuses the
   save in plain words when a heading has moved. A refusal surfaces on the phone as
   "SHEET REFUSED: …", so it is told rather than retried.
5. **The read path uses `getDisplayValues()`** — what a cell LOOKS like, not what it holds. Nothing
   in either notebook is formatted today (setup only sets a date format on column A), so this costs
   nothing, but a number column given a comma or a currency symbol would come back as `"$11,000"`
   and load as blank. The guard is a line in README telling the owner not to format those columns,
   deliberately in place of code: a converter would be a new function and a new code path for
   something that has never happened. If it ever DOES happen, strip the symbols in `cell()` in
   `services/mapping.ts` — do not reach for it before then.

## Engine facts worth remembering

- **`bibleCompare.ts` is for the GRAPH, not for a night.** `traysForNeeds`/`batchesForNeeds`
  divide PLAINLY — need ÷ balls-per-tray, fractions kept — and assume nothing on hand. That is
  the owner's own definition (Aug 2026) and it is the only footing on which two bibles compare;
  it is deliberately NOT a night's make, which rounds each size up to a whole tray and subtracts
  what is left. Peach's `trays`/`batches` JSON columns stay UNUSED: they are binder reference,
  they disagree with the app's own tray maths (17 where the app says 17.98), and regular has no
  such columns at all — using them would make the two books incomparable. Don't "fix" this.
- `runDoughCalculation(inputs, bibles, config)` → `DoughDayRecord`;
  `runEonCalculation(eonInputs, dayRecord | null, bibles, config)` → `EonRecord`;
  `computeAmUse(yesterdayEonHave, todayHave, amSales)` → `AmUse`. All pure; bibles and config are
  always passed in; blank inputs are `null` and stay null.
- **Bible lookup** (v1.13.0, ported from the owner's other app): exact row wins; outside the range
  clamp to the nearest end; between rows the default is **UP**. It rounds **DOWN** only on a SLOW
  DAY — both forecasts entered and both strictly under `slowDayUnder` ($13,000) — and even then
  never by more than `maxRoundDownGap` ($400); a wider gap falls back to up, including when the
  direction was tapped by hand. `isSlowDay`/`resolveForecastRound` in `core/bible.ts` are the two
  helpers; the direction is resolved ONCE per record, before both lookups, because it shifts the
  use and the need and with them every tray the batch rule is judged on.
- **Sicilian minimum** (v1.13.0): `make` floors at `sicMinimum.make` (1) unless `sicMinimum.waiverAt`
  (8) or more are already on hand — and only when Sicilian was actually counted, so a blank size
  still makes nothing. Moot on a closed tomorrow.
- **The batch direction resolves itself** (v1.13.0): `over = totalTrays % 11`; down when `over` is
  1–2 on any night, widening to 1–5 on a slow day; up otherwise. The pills override it, and tapping
  the pill already in force hands the night back to the rule. Both `batchDown` and `batchUp` are
  still built so either pill can be tapped.
- **Tray adjustment leans LARGE**: `LG = ceil(0.6 × n)`, Small takes the rest, so Large is strictly
  ahead at every delta (2 → 0 SM / 2 LG; 4 → 1/3; 7 → 2/5). A round-down mirrors it.
- Tomorrow forecast typed 0 = **closed tomorrow**: zero need/make everywhere including Boli, no
  batch choice. Blank tomorrow = unknown, not zero.
- `left` keeps raw negatives; the shortfall is a per-size **set-out** (whole trays) and tomorrow's
  make = need − left replaces it (dough conserves). salesLeft 0 → use 0; negative → use 0 +
  `negativeSalesLeft`.
- Boli top-up counts trays AND singles toward 36 balls; the EON check includes Boli vs that target.
- Batch round-down floors at 1 batch when there is dough to make; the tray adjustment leans LARGE
  (`LG = ceil(0.6 × n)`), never below 0, whole delta to the only counted one of the pair.
- `npm run dev` starts the preview. The four gates are wired into CI.

**Owner-chosen defaults (don't change without asking):**
1. The EON check INCLUDES Boli against its 36-ball target (0 on a closed tomorrow).
7. **The app resolves the batch direction; the pills override it** (Aug 2026). This REPLACED
   "the owner taps one, the engine never picks" — the owner re-chose the other app's behaviour,
   twice, in writing. A consequence they accepted: `Final Make Amount`, `Estimated Dough After
   Gang` and `PM Dough Use` now fill without a tap, because a direction always exists. That
   supersedes the old default #3 below.
2. Night temps slot stays "after 17:00".
5. **Temps are typed, never copied forward** (Aug 2026). LOAD LAST TEMPS was removed: it wrote the
   previous readings straight into the current slot with the current clock time, i.e. it filed
   measurements nobody took. Pre-filled temperature logs are records falsification and are what an
   inspector looks for. Do not re-add a "copy last readings" affordance in any form — ghost text,
   placeholder, autofill — without the owner asking for it explicitly.
6. **The closing Boli count stays off the sheet** (Aug 2026). `EON Dough Count` has no Boli column
   and `PM Dough Use` no Boli use, so the EON Boli count is screen-only: it feeds the outlook and
   the phone, and reloading that date brings it back blank. The owner chose to keep the Dough Log's
   layout untouched over recording it. Written down in README so it can't surprise anyone.
3. ~~Sheet columns depending on the tapped batch choice stay blank until a choice is tapped.~~
   SUPERSEDED by #7 — a direction always resolves now, so those columns always fill. What DOES
   stay blank is the two **Rounding** columns: they carry the owner's TAP (blank = auto), never the
   resolved direction, or a reloaded night would freeze tonight's answer and stop re-resolving.
4. Sicilian never goes negative anywhere: no same-day set-out at 2 PM (`left` floors at 0) and its
   outlook diff clamps at 0 too. Separate from the v1.13.0 minimum, which floors the MAKE at 1. This REPLACED an earlier default that had EON Sicilian shortfalls
   reporting at full strength — superseded Aug 2026 by the owner's rule and by their other app,
   which clamps it identically.
