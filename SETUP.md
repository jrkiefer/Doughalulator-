# SETUP.md — the plain-words diary of how Dough Tracker went live

*Written July 30, 2026, the day the app went online. Keep this file — it's the map back to everything.*

## The app

- **Address:** https://jrkiefer.github.io/Doughalulator-/
- It's on the owner's phone home screen as **Dough Tracker** (added via Safari/Chrome "Add to Home Screen").
- Three pages: **2 PM** (afternoon count + what to make), **EON** (end of night), **STATION TEMPS**. **SETTINGS** link at the very bottom.

## Where the app itself lives

- GitHub account: **jrkiefer** · repository (the online folder): **Doughalulator-**
  https://github.com/jrkiefer/Doughalulator-
- The website turns on automatically: any change pushed to the **main** branch gets tested and published to the address above by GitHub (Settings → Pages is set to "GitHub Actions"). Nobody ever uploads files by hand.

## The two Google notebooks (in the owner's Google account)

1. **Hot Tomato Dough Log** — every 2 PM and end-of-night record, one row per day across twelve tabs, plus read-only copies of both dough bibles.
2. **Hot Tomato Temp Log** — an Overview of the latest temps, one tab per station, and a Log tab that keeps every reading ever submitted, forever, with clock times.

Each notebook has a small machine inside it (open the sheet → **Extensions → Apps Script** — the code came from this repo's `apps-script/` folder):

- **There are no passwords.** The owner chose simplicity over the lock, so each notebook is reached by its web address alone. Treat those /exec addresses as semi-public: anyone who has one can read or change that notebook.
- Because of that, **nothing destructive is reachable over the web**. Erasing a log is the **Erase all data** item in the spreadsheet's own menu (Dough Tools / Temp Tools), which asks before it acts.
- Each script was **deployed as a web app** (Deploy → Manage deployments): "Execute as: Me", "Access: Anyone". That produced the two long **/exec addresses** pasted into the app's Settings.
- The `setup()` function inside each script builds any missing tabs. It's safe to run again anytime (for example after adding a new station to the temps script's STATIONS list).

## The app's Settings (on each phone)

Settings stores the two /exec addresses and the two secrets **on that phone only**. A new or wiped phone needs them re-entered:

1. Open the sheet → Extensions → Apps Script → Deploy → Manage deployments → copy the web app URL.
2. In the app: SETTINGS → paste the URL → **Test Connection** should say "Connected ✓". There is no password to enter.

## Everyday things worth knowing

- **The app saves by itself.** Every number typed is kept on the phone instantly and sent to Google a couple of seconds later — there are no Save buttons.
- **The colored dot** top-left tells the truth: NEW NIGHT (nothing typed) → SAVED ON PHONE → SYNCING → SYNCED · OFFLINE — WILL RETRY (it sends itself when internet returns) · red warnings if the sheet refused a save or nothing could be saved anywhere.
- **LOAD FROM SHEET** brings a saved date back into the form. **LOAD LAST TEMPS** pre-fills the previous readings (it never fills anything without being tapped).
- **Don't rename** the two spreadsheets' tabs or their column headers, and don't rename the station tabs — the app finds everything by those exact names.
- The dough bibles the app calculates from live in this repo (`src/data/`). The bible tabs in the spreadsheet are just a mirror for reading.

## The old tracker's history lives in the Dough Log too

In August 2026 the owner's previous tracking spreadsheets were imported into the Dough Log so past dates are filled in — 58 complete days (Apr 1 – Jul 29, 2026), each having both a 2 PM record and a verified final-sales figure; the owner chose to leave incomplete days out. End-of-night sales came from the owner's "End of Night Sales Completed" file, which prefers the DOR weekly report emails over crew entries. A few details future helpers should know:

- Old counts were whole-ball totals, so they appear in the Singles/Have columns with Trays blank — that's faithful, not a bug.
- Some early-April dates have no Final Dough row: the real post-make final was never recorded back then, and inventing one would corrupt the PM-use math.
- Days missing their final sales (no DOR report email ever arrived) or missing a 2 PM record were left out on purpose. When missing numbers turn up, a Claude session can rebuild the history file from the owner's uploads and re-run `scripts/import-history.ts` (dry → live → verify) — saves merge by date, so re-imports are safe.

## Notes for whoever helps next

- Both Apps Scripts accept a secret-guarded erase (`type: 'wipe'` with the confirm phrase `WIPE ALL DATA`) over their web-app URL. It is destructive and reachable by anyone holding the sheet's secret — kept because that same secret already allows overwriting every row, and because it is how a remote helper resets the sheets. `wipeAllData()` can also be called from the Apps Script editor if you would rather keep it off the network.
- Column A of every tab is date-formatted, so Google stores real dates there and `getValues()` hands back Date objects, not the text that was written. Anything matching rows by date must go through `normalizeDate` (which handles all three shapes) — matching on the raw value silently appends duplicate rows instead of merging. The test harness models this quirk deliberately.

## How the Dough Log works now (v1.3.0)

The app works out every number and writes it into the right tab. The notebook keeps the record; it holds no formulas, so nothing in it can break.

- **The 2 PM save** fills: `2PM Dough Count`, `Look up Dough Use for PM`, `Look up Dough Use Tomorrow`, `Dough Make (estimate)`, `Final Make Amount`, `Estimated Dough After Gang`, and `AM Dough Use`.
- **The EON save** fills: `EON Dough Count`, `PM Dough Use`, and that night's line on `New Bieblerb` (or `New Peach Bieblerb`).
- Change any one number and the whole day is worked out and saved again. Each number shows **saved** on its corner once it has reached the notebook.
- **The new bible builds itself.** Each finished night adds a line — date, that night's sales, the day's whole use per size. After every end-of-night save the script refits a line through *all* the recorded nights and rewrites the "New" column beside the current one. Three nights in it starts suggesting; it sharpens from there with nothing to press. A night with no takings is left out so it can't drag the fit.
- **Tab names must stay at or under 31 characters.** Google truncates longer ones, and two that truncate alike silently collide — one tab ends up called `Sheet2` and everything written to it disappears. That bug cost a whole rebuild; `makeTab()` now refuses to run rather than let it happen quietly.
- Correcting a number **in the notebook** stays corrected until the app saves that date again. To make it stick, open that date in the app and tap **LOAD FROM SHEET** — the app pulls your correction in and recalculates from it.
- A night whose end-of-night sales came in below the 2 PM figure leaves its PM-takings cell blank rather than showing a negative.

## If something ever looks wrong

- App won't save ("will sync" forever): open SETTINGS and tap both **Test Connection** buttons. If one fails, re-copy that sheet's URL (steps above).
- A "This app isn't verified" Google warning during any re-setup is normal for personal scripts: Advanced → Go to… → Allow.
- Anything bigger: a fresh Claude session should read **BUILD-PLAN.md + PROGRESS.md + CLAUDE.md** in this repo and will know the whole story.
