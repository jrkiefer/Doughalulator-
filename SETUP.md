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

- Near the top of each script is a line `var SECRET = '…';` — that's the **secret password** for that notebook. The same secret is typed into the app's Settings. **The secrets are only in those two places** — never written down in this repo.
- Each script was **deployed as a web app** (Deploy → Manage deployments): "Execute as: Me", "Access: Anyone". That produced the two long **/exec addresses** pasted into the app's Settings.
- The `setup()` function inside each script builds any missing tabs. It's safe to run again anytime (for example after adding a new station to the temps script's STATIONS list).

## The app's Settings (on each phone)

Settings stores the two /exec addresses and the two secrets **on that phone only**. A new or wiped phone needs them re-entered:

1. Open the sheet → Extensions → Apps Script → copy the secret from the `SECRET` line.
2. Deploy → Manage deployments → copy the web app URL.
3. In the app: SETTINGS → paste URL + secret → **Test Connection** should say "Connected ✓".

## Everyday things worth knowing

- **The colored dot** top-left: NEW NIGHT (fresh form) → SAVED (reached Google) → UNSYNCED (kept safely on the phone, will sync next time the app opens with internet) → LOADED (a saved day pulled back in).
- **Nothing saves by accident.** A day only saves when a Save button is tapped, and the 2 PM save insists on a Round up/down choice first.
- **LOAD FROM SHEET** brings a saved date back into the form. **LOAD LAST TEMPS** pre-fills the previous readings (it never fills anything without being tapped).
- **Don't rename** the two spreadsheets' tabs or their column headers, and don't rename the station tabs — the app finds everything by those exact names.
- The dough bibles the app calculates from live in this repo (`src/data/`). The bible tabs in the spreadsheet are just a mirror for reading.

## If something ever looks wrong

- App won't save ("will sync" forever): open SETTINGS and tap both **Test Connection** buttons. If one fails, re-copy that sheet's URL and secret (steps above).
- A "This app isn't verified" Google warning during any re-setup is normal for personal scripts: Advanced → Go to… → Allow.
- Anything bigger: a fresh Claude session should read **BUILD-PLAN.md + PROGRESS.md + CLAUDE.md** in this repo and will know the whole story.
