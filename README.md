# Doughalulator — the Hot Tomato dough app

**Live at → https://jrkiefer.github.io/Doughalulator-/**

It sits on the phone home screen as **Dough Tracker** (added through the browser's
"Add to Home Screen"). It works out how much dough to make tonight, checks that tomorrow is
covered, keeps the fridge temperatures, and writes all of it into two Google spreadsheets by
itself. There is nothing to press to save.

This page is the whole story: what the app does, how it is wired to Google, what every folder in
here holds, and what to do when something looks wrong.

---

## The three pages

| Page | What it's for |
| --- | --- |
| **2 PM** | The afternoon count. Type today's forecast, what's rung up so far, tomorrow's forecast, and what dough is on hand. It works out what tonight will use, what's left, what tomorrow needs, and how many trays to make — then offers two batch numbers, rounded down and rounded up. **You tap one.** The app never picks for you. |
| **EON** | End of night. The closing count and the final sales figure. It checks what's on hand against what tomorrow needs, all five sizes, and works out the night's dough use. |
| **STATION TEMPS** | The eight stations in walking order, three times a day — Morning, 2 PM, Night. The app suggests the right one by the clock. |

**SETTINGS** is the small link at the very bottom.

### How the maths works, in ordinary words

1. **The bible.** A bible is a lookup table: a sales figure in, dough needed per size out. There
   are two — the regular one, and a peach-season one used July 1 through August 31. The app picks
   by the date; in peach season a toggle appears if you want to force the other one.
2. **Sales typed small mean thousands.** Type `11` and it reads $11,000. Anything over 50 is taken
   literally. `0` stays `0`.
3. **Tonight's use** comes from the selling still to come — today's forecast minus what's rung up.
   **Tomorrow's need** comes from tomorrow's forecast. Both go through the bible.
4. **What to make** = what tomorrow needs, minus what will be left after tonight. If tonight is
   going to eat into dough you already have, that dough is flagged to **set out now**, and
   tomorrow's make replaces it — dough is never counted twice.
5. **Trays into batches.** One mixer run is 11 trays. The app shows the exact number of batches and
   offers it rounded both ways; the tray difference is absorbed by Small and Large, 40/60.
6. **Boli** is never in the bible. Its rule is simply: top the count back up to 6 trays.

Typing `0` for tomorrow's forecast means **closed tomorrow** — nothing to make. Leaving it blank
means *unknown*, which is not the same thing, and the app treats it that way throughout.

---

## The two Google notebooks

Both live in the owner's Google account.

1. **Hot Tomato Dough Log** — every 2 PM and end-of-night record, one row per day across thirteen
   tabs, plus read-only copies of both bibles and the two self-building "New Bieblerb" tabs.
2. **Hot Tomato Temp Log** — an Overview of the latest temperatures, one tab per station, and a Log
   tab that keeps every reading ever taken, with clock times, forever.

Each notebook has a small machine inside it: open the sheet → **Extensions → Apps Script**. That
code comes from the `apps-script/` folder in here.

- **There are no passwords.** The owner chose simplicity over the lock (August 2026), so each
  notebook is reached by its web address alone. Treat those `/exec` addresses as semi-public:
  anyone holding one can read or change that notebook.
- Because of that, **nothing destructive is reachable over the web**. Erasing a log is the
  **Erase all data** item in the spreadsheet's own menu (**Dough Tools** / **Temp Tools**), which
  asks before it acts. A test in this repo checks that the scripts refuse an erase sent over the
  internet.
- Each script is **deployed as a web app** (Deploy → Manage deployments) with "Execute as: **Me**"
  and "Access: **Anyone**". That is what produces the two long `/exec` addresses.
- The `setup()` function inside each script builds any missing tabs. It is safe to run again
  anytime — for example after adding a station to the temps script's `STATIONS` list.

### Connecting a phone

Settings are stored **on that phone only**, so a new or wiped phone needs them again:

1. Open the sheet → Extensions → Apps Script → Deploy → Manage deployments → copy the web app URL.
2. In the app: **SETTINGS** → paste the URL → **Test Connection** should say "Connected ✓".
   There is no password to enter.

### What the Dough Log holds

The app works out every number and writes it into the right tab. The notebook is a plain record —
it holds no formulas, so nothing in it can break.

- **The 2 PM save** fills `2PM Dough Count`, `Look up Dough Use for PM`,
  `Look up Dough Use Tomorrow`, `Dough Make (estimate)`, `Final Make Amount`,
  `Estimated Dough After Gang` and `AM Dough Use`.
- **The EON save** fills `EON Dough Count`, `PM Dough Use`, and that night's line on
  `New Bieblerb` (or `New Peach Bieblerb`).
- Change any one number and the whole day is worked out and saved again. Each number shows a small
  green **saved** tag once it has reached the notebook.
- **The new bible builds itself.** Every finished night adds a line — the date, that night's sales,
  the whole day's use per size. After each end-of-night save the script fits a line through *all*
  the recorded nights and rewrites the "New" column beside the current one. Three nights in it
  starts suggesting, and it sharpens from there with nothing to press. A night with no takings is
  left out so it cannot drag the fit.
- Correcting a number **in the notebook** stays corrected until the app next saves that date. To
  make it stick, open that date in the app and tap **LOAD FROM SHEET** — the app pulls the
  correction in and recalculates from it.
- A night whose end-of-night sales came in below the 2 PM figure leaves its PM-takings cell blank
  rather than showing a negative.

### The old tracker's history is in there too

In August 2026 the previous tracking spreadsheets were replayed into the Dough Log through the real
calculation engine, so past dates are filled in. Things worth knowing:

- Old counts were whole-ball totals, so they land in the Singles/Have columns with Trays blank —
  faithful, not a bug.
- Some early dates carry no Final Dough row: the real post-make figure was never recorded then, and
  inventing one would corrupt the dough-use maths.
- Days missing a final sales figure or a 2 PM record were left out on purpose. If those numbers
  ever turn up, `scripts/import-history.ts` can be re-run (dry → live → verify) — saves merge by
  date, so re-importing is safe.

---

## Everyday things worth knowing

- **The app saves by itself.** Every number typed is kept on the phone instantly and sent to Google
  a couple of seconds later. There are no Save buttons.
- **The coloured dot** at the top left tells the truth: NEW NIGHT (nothing typed) → SAVED ON PHONE →
  SYNCING → SYNCED. OFFLINE — WILL RETRY means it will send itself when the internet comes back. A
  red dot means the sheet refused a save, or nothing could be saved anywhere.
- **LOAD FROM SHEET** brings a saved date back into the form. **LOAD LAST TEMPS** pre-fills the
  previous readings — it never fills anything unless tapped.
- The **◀ ▶** arrows step a day at a time, and the date itself opens a calendar.
- **Don't rename** the spreadsheets' tabs, their column headers, or the station tabs. The app finds
  everything by those exact names.
- **Don't reformat the number columns** either — no commas, no dollar signs. The app reads a cell
  the way it looks, so `$11,000` comes back as words rather than a number and that day would load
  blank. Leave the numbers plain and everything stays readable to it.
- The bibles the app calculates from live in this repo (`src/data/`). The bible tabs in the
  spreadsheet are a read-only mirror.

## If something looks wrong

- **Stuck on "will sync":** open SETTINGS and tap both **Test Connection** buttons. If one fails,
  re-copy that sheet's URL using the steps above.
- **"This app isn't verified"** from Google during a re-setup is normal for personal scripts:
  Advanced → Go to… → Allow.
- **Anything bigger:** a fresh Claude session should read `CLAUDE.md` in this repo — it holds the
  whole working picture.

---

## What's in this repo

Everything is in a folder. Only the two documents and the tool files sit loose at the top.

| Folder | What's in it |
| --- | --- |
| `src/app/` | The shell — the page itself (`App.tsx`), the wiring that turns typing into saves (`engine.ts`), the entry point, and the one stylesheet holding the entire design. |
| `src/core/` | The calculation brain. Pure maths, no screen and no internet — every function tested. |
| `src/config/` | Every tunable number in one place: balls per tray, batch size, season dates, rounding rules, the station list. Change numbers here, never in `core`. |
| `src/data/` | The two real bibles as data, plus the one file that loads them. **Never alter a number in these.** |
| `src/features/` | The screen, one folder per page or piece: `twoPm`, `eon`, `temps`, `settings`, `history`, `bibleViewer`, plus `shell` and `shared`. |
| `src/services/` | Talking to Google: the autosave engine, the phone's own storage, the transport, and the mapping that turns a record into sheet rows. |
| `apps-script/` | The code that lives inside the two spreadsheets (`dough/Code.gs`, `temps/Code.gs`) and, in `test/`, a fake Google that runs those real files in-process so they can be tested here. |
| `scripts/` | The one-off history importer. |
| `design/` | The four original screenshots — the record of what goes on each page and how it's worded. Their colours and fonts are superseded; the design now lives in the tokens at the top of `src/app/styles.css`. |
| `public/` | The app icon. |
| `.github/` | The robot that tests and publishes every change. |

## Making changes

Any change pushed to the `main` branch is tested by GitHub and, only if everything passes,
published to the live address. Nobody ever uploads files by hand.

```bash
npm install     # once
npm run dev     # preview it locally

npm run typecheck && npm run lint && npm test && npm run build   # the four gates
```

All four must pass before a push — they are the same four the robot runs.

## Version history

| | |
| --- | --- |
| **1.8.0** | A second read-through, aimed at the parts the first one covered least. One real bug: an end-of-night entry on a day with no 2 PM record was filed under the wrong dough bible during peach season. |
| **1.7.0** | A full read-through of every line, and the four real bugs it turned up: the Day's Work card claiming "nothing to make" before anything was counted; LOAD FROM SHEET keeping numbers the sheet doesn't have and marking them saved; a mistyped sheet address hanging Test Connection for ever; and the bible mirror never being sent, which could quietly stall the self-building bible. |
| **1.6.0** | The repo tidied: everything in folders, the finished build's paperwork removed, duplicate code collapsed, this page written. |
| **1.5.0** | The look — the Mise en Place design ported in, on one flat background that a phone's dark mode can't invert. |
| **1.4.0** | Passwords dropped at the owner's request, and the erase button taken off the internet with them. |
| **1.3.0** | The Dough Log rebuilt to the owner's own layout, the app made the only calculator, and the self-building bible added. 36 nights imported. |
| **1.1–1.2** | First two attempts at the owner's sheet layout, ending with the app doing all the maths. |
| **1.0** | Autosave replacing every Save button, blank-vs-zero end to end, the History card, and the offline behaviour. |
| **0.x** | The original build: the engine, the three pages, the two spreadsheets, and going live. |
