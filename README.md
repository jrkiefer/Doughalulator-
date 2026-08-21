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
| **2 PM** | The afternoon count. Type today's forecast, what's rung up so far, tomorrow's forecast, and what dough is on hand. It works out what tonight will use, what's left, what tomorrow needs, and how many trays to make — then settles on a batch count. **Round up / Round down is always there if you disagree.** |
| **EON** | End of night. The closing count and the final sales figure. The outlook card then lays what's on hand beside what tomorrow needs, size by size, and tells you in trays and balls whether you're over or under. Tomorrow's forecast carries over from the 2 PM save; type in it and yours wins. |
| **STATION TEMPS** | The eight stations in walking order, three times a day — Morning, 2 PM, Night. The app suggests the right one by the clock. |

That's the whole app. There is nothing to set up and nothing to connect — the two notebooks are
built in, so any phone that opens the page is already working.

### How the maths works, in ordinary words

1. **The bible.** A bible is a lookup table: a sales figure in, dough needed per size out. There
   are two — the regular one, and a peach-season one used July 1 through August 31. The app picks
   by the date; in peach season a toggle appears if you want to force the other one.
2. **Sales typed small mean thousands.** Type `11` and it reads $11,000. From 100 upward it is
   taken literally, so `100` is one hundred dollars. `0` stays `0`.
3. **Tonight's use** comes from the selling still to come — today's forecast minus what's rung up.
   **Tomorrow's need** comes from tomorrow's forecast. Both go through the bible.
4. **What to make** = what tomorrow needs, minus what will be left after tonight. If tonight is
   going to eat into dough you already have, that dough is flagged to **set out now**, and
   tomorrow's make replaces it — dough is never counted twice.
5. **Sicilian is the exception.** It is never set out and used the same day, so it just runs out:
   it never shows a negative, it is never in the set-out list, and tomorrow simply makes what
   tomorrow needs.
6. **Trays into batches.** One mixer run is 11 trays. The app settles on a batch count itself — a
   couple of trays past a whole batch rounds down rather than firing up the mixer again, and on a
   quiet day it will shed up to five. **Round up / Round down is always there to overrule it**, and
   tapping the one already chosen hands it back to the app. The tray difference is absorbed by Small
   and Large, leaning Large.
7. **Quiet days round down.** When both forecasts are under $13,000 the bible rounds down to the row
   below rather than up — but never by more than $400, because that is more dough than one step
   should ever shed. Every other night rounds up. The **Rounding** pair of buttons to overrule that
   lives in the Dough Bible drawer — the rounding decides which bible row a look-up lands on,
   so it sits with the bible.
8. **Sicilian never drops to nothing.** If fewer than 8 are on hand, at least 1 gets made.
9. **Boli** is never in the bible. Its rule is simply: top the count back up to 6 trays.

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

- **There are no passwords**, and since August 2026 the two web addresses are **built into the app**
  rather than typed into it. That is why a new or wiped phone now just works. The trade you chose
  knowingly: those addresses are published in the app's code, so anyone who goes looking could read
  your recorded nights or write junk rows into them. Nobody can erase anything — see below.
- Because of that, **nothing destructive is reachable over the web**. Erasing a log is the
  **Erase all data** item in the spreadsheet's own menu (**Dough Tools** / **Temp Tools**), which
  asks before it acts. A test in this repo checks that the scripts refuse an erase sent over the
  internet.
- Each script is **deployed as a web app** (Deploy → Manage deployments) with "Execute as: **Me**"
  and "Access: **Anyone**". That is what produces the two long `/exec` addresses.
- The `setup()` function inside each script builds any missing tabs. It is safe to run again
  anytime — for example after adding a station to the temps script's `STATIONS` list.
- **Dough Tools → Check the log** looks the whole notebook over and tells you in plain words if
  anything is off: a heading that has been moved or renamed, a day that has ended up with two rows
  (the app only ever reads the first, so the second is invisible to it), or a date cell it can't
  read. It only looks — it changes nothing. Worth running if a day ever seems not to save.

### Setting up a phone

Nothing to do. Open the web address, add it to the home screen, and it is connected — the two
notebooks are built into the app.

**If an address ever changes** — creating a *new* deployment gives a new `/exec` address, while
updating an existing one keeps the old address — the app has to be told. That is one line in
`src/services/sheets.ts`; ask a fresh Claude session to change it and push. Until then the app
would say it can't reach the sheet.

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
- **The new bible builds itself.** After each end-of-night save, the notebook's own machine works
  out every recorded day's *whole* dough use — the morning (yesterday's close-count minus the
  2 PM count — yesterday exactly, so a day after a closed day is left out rather than guessed
  at) plus the night (the after-gang dough minus the closing count) — rewrites its history from
  that, and fits a line through all of it. Three
  days in it starts suggesting, and it sharpens from there with nothing to press. A day with no
  takings is left out, and a day it can only half-see is left out rather than under-counted.
- **Correcting a number by hand: which ones stick.** Fix a **count or a sales figure** on
  `2PM Dough Count` or `EON Dough Count`, then open that date in the app and tap **LOAD FROM
  SHEET** — the app takes the correction and works the whole day out again from it. Those two tabs
  are the only ones it reads. Everything else — the two look-ups, the make, the final make, the
  dough after gang — are *results*, so a number changed there is simply replaced the next time that
  date saves. Correct the count, not the answer.
- A night whose end-of-night sales came in below the 2 PM figure leaves its PM-takings cell blank
  rather than showing a negative.
- **The closing Boli count is on screen only.** The end-of-night page asks for it and the outlook
  card uses it, but `EON Dough Count` has no Boli column, so it is never written down and comes
  back blank if you reload that date. That is deliberate — it keeps your Dough Log's layout exactly
  as you built it. Say the word and it can be recorded instead.

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
  SYNCING → SYNCED. OFFLINE — WILL RETRY means it is trying by itself — after ten seconds, then
  twenty, then forty, easing off to once every five minutes until it gets through. It also tries
  the moment the signal returns and the moment you come back to the app. A red dot means the sheet
  refused a save, or nothing could be saved anywhere.
- **LOAD FROM SHEET** brings a saved date back into the form.
- **The Graphs drawer** (bottom of the 2 PM page) is the only place the self-building bible is visible. It loads nothing until you tap the button, so it costs a normal night nothing.
- **Every temperature gets typed.** There is no way to copy the last readings forward, on purpose:
  a temperature log is a record of measurements actually taken, and filling one in with yesterday's
  numbers is the exact thing a health inspector looks for.
- The **◀ ▶** arrows step a day at a time, and the date itself opens a calendar.
- **Don't rename** the spreadsheets' tabs, their column headers, or the station tabs. The app finds
  everything by those exact names.
- **Don't reformat the number columns** either — no commas, no dollar signs. The app reads a cell
  the way it looks, so `$11,000` comes back as words rather than a number and that day would load
  blank. Leave the numbers plain and everything stays readable to it.
- The bibles the app calculates from live in this repo (`src/data/`). The bible tabs in the
  spreadsheet are a read-only mirror.

## If something looks wrong

- **Stuck on "will sync":** it is trying by itself and will get through when the connection comes
  back — nothing is lost in the meantime. If it stays stuck with good signal, the notebook's web
  address may have changed (see *Setting up a phone* above).
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
| **1.25.0** | The Station Temps tab got four asks in one go. **Every temp now wears its own save tag**: type or change a reading and its little chip goes *saving…* then *saved* the moment the Temp Log has it — before this, the tag watched the whole day including the dough numbers, so a saved temperature could sit there looking unsaved just because the dough side was busy. **History on this tab is now temp history**: each station's last three readings in plain words, newest in bold — the same figures the graph draws. **Today's temps starts open** — no tap to reach the boxes. And behind the scenes, each tab's code now lives fully in its own folder (2 PM, EON, Temps each own their whole page), so future changes to one tab can't trip over another. |
| **1.24.1** | Found by filling the log with your three nights of sample data: Google quietly reads the words "2 PM" in the log as a clock time and hands them back as "2:00 PM", which knocked that column out of order on the new graph. The graph now recognises both spellings, so the afternoon column sits where it belongs — between Morning and Night — and is labeled 2 PM. |
| **1.24.0** | The temp graph is now a **simple line graph**, replacing the dot rows. Time runs along the bottom — the last three reading moments, each labeled with its slot and date ("2 PM / 8/16") — and degrees run up the side on a fixed scale: **28–40 shaded GOOD, 40–60 shaded DANGER ZONE**. A bar of station buttons above it lets you draw one or more stations at once; your picks are remembered on your phone. A reading hotter than 60 becomes a red arrow pointing out the top with its real number and the warning **"Check foods / Check chicken"**. Tap the graph to read every shown station at that moment. |
| **1.23.0** | Little arrows in the **Dough Bible** table now point at the rows the night is standing on, just like your old app: **←TONIGHT** is the row for today's whole forecast, **←LEFT** is the row for the selling still to come (the exact row the maths reads for tonight's use), and **←TMRW** — in red, with the strongest highlight — is the row tomorrow's need comes from. They follow your rounding choice, share a row when the figures land together, and disappear on a day with nothing typed. |
| **1.22.0** | The forecast **Rounding** buttons moved off the sales card and into the **Dough Bible** drawer, where your other app has always kept them — rounding decides which bible row a look-up lands on, so it belongs with the bible. The little tag beside them now carries the rule itself (*AUTO · SLOW DAY = DOWN*), and the sentence that used to explain it under the sales fields is gone. |
| **1.21.1** | Tidy-ups, measured rather than eyeballed. The two graph drawers now sit **last on their pages** — Bible comparison after History and the Dough Bible on the 2 PM page, Temp graph after History on the temps page. Every card now sits exactly the same distance from the next (the Dough Bible card used to sit half as far from whatever followed it). And the small corner notes beside the section titles hold one line on a phone instead of wrapping — the sales one now just says *TOMORROW 0 = CLOSED*, since the $-shorthand teaches itself as you type. |
| **1.21.0** | A **Temp graph** drawer on the Station Temps page, shut until opened. Tap LOAD GRAPH and each station gets a row on one °F scale: its last three readings as dots — paler for older, solid for the newest, with the newest figure printed at the row's end — straight off the Log, so corrections show as the newer entry they are. Tap a row to read all three with their time slots and dates. The freezer's below-zero readings sit left of an emphasised 0° line. **Needs its own one-off update, this time in the Temp Log** — same dance as the Dough Log's: paste the script, update the existing deployment. Three days of made-up sample readings were written into the log at your ask so the graph had something to show; they fall out of view after one real day of readings. |
| **1.20.1** | Tightened before it ever reached your notebook: the morning figure now comes from **the day before only**. If the previous close isn't from yesterday exactly — a closed day in between, a gap in the record — that day is simply left out of the new bible, no guessing. Your call, to be extra safe, and it matches how the app itself works out the morning on screen. |
| **1.20.0** | More days now feed the new bible, and every one of them is a *whole* day. Before, the morning-plus-night sum was worked out on whichever phone saved the night — so if the closing count was entered on one phone and the next afternoon on another, or a phone was wiped, the morning silently went missing and the evening got recorded as if it were the whole day, dragging the suggestion low. Now the notebook works it out itself from what's already written in it: last night's close minus the 2 PM count for the morning (reaching back over closed days up to a week, so Tuesdays after a closed Monday count too), the after-gang dough minus the closing count for the night. A day it can only half-see is left out instead of under-counted. **Needs the one-off spreadsheet update** — paste the script and update the existing deployment, then run *Refresh new-bible suggestions* once from the Dough Tools menu. |
| **1.19.0** | The graph slimmed back down, at your ask. The Gap and Table buttons and the sentence under the chart are gone, along with the "05 Graphs" heading over the drawer — one graph, nothing extra. What stayed: the two bible buttons, the size buttons, tapping the graph to read a figure, and the labels. The chart itself got a light polish — slightly bigger axis numbers, a touch more height, and the suggested line drawn a shade heavier than the dashed bible line so the eye goes to the right one. |
| **1.18.0** | The graph now answers the question instead of leaving you to work it out. A **Gap** button draws just the difference between the two bibles against a zero line — red where your nights say make more, blue where they say make less — so you can see at a glance where the two part company, instead of trying to judge the distance between two lines running side by side. Under every view there is now **one sentence** saying what it means, e.g. *"Your nights say make more Small below $11,500 and less above it — biggest gap 46 fewer at $20,750."* Tapping the graph also shows the difference **as a percentage**, which matters for the small counts: 3 Sicilian off 7 is a big change, 3 Small off 276 is not. Red and blue, not red and green — the obvious pair is the one colour-blind eyes can't separate. |
| **1.17.0** | The graph, made readable. The two lines were genuinely hard to tell apart — not a matter of taste: measured against the standard for how far apart two colours have to be, three of the five views failed, and two failed the colour-blind test as well. The bible you have now is drawn in **black dashes**, the suggested one in the size's own colour, and the gap between them is **shaded in** so you can see at a glance where they part company. **Labels added**: the bottom says SALES $, the side says whether you're looking at balls or batches, and each line's last figure is printed at its end. The bottom axis now starts and ends just outside your bible instead of running from zero, so the lines fill the box. **Tap anywhere on the graph** and it tells you the sales figure, both numbers and the difference. And a **Table** button lists every row as plain figures for when you want to read rather than look. |
| **1.16.0** | A **Graphs** drawer at the bottom of the 2 PM page, shut until you open it. Tap **LOAD GRAPH** and it draws the bible you have now against the one your own nights have been quietly building in the Dough Log — sales along the bottom, and buttons to switch between the regular and peach books and between Indi, Small, Large, Sic and Batches. The dashed grey line is the bible as it stands; the coloured one is what your nights suggest. It remembers the last load, so it opens instantly and still draws with no signal. A book with fewer than three finished nights has nothing to suggest yet and says so. **This one needed a change inside the Dough Log** — the app had never been able to read those suggested numbers. |
| **1.15.1** | Two tidy-ups on the set-out box and the Boli row. The red **SET OUT NOW** heading now stays on one line instead of spilling onto two — it reads as a banner again rather than a paragraph, and it holds that line on any phone. And **whole trays only** has gone from the Boli row: the row already shows it. **not counted** still appears there when you haven't counted Boli, because that one is worth knowing — it means Boli is left out of tonight's batch total. |
| **1.15.0** | Four small things on the 2 PM page, brought back from your other app. The rounding line under the batch number now tells you what actually moved — **▴ rounded up · +2 trays · +2 LG** instead of just "rounded up from 41" — in red when it rounds up and green when it rounds down. The **Planned** line drops the "· 3.7 batches" decimal and just says the trays. The **set-out** box says what the old one said — *Set out now — tonight dips into same-day dough*, then plainly *Small: 3 trays* — and the sentence underneath it is gone. And the **Boli** row now reads in balls all the way across (HAVE 24 · TARGET 36 · MAKE 12) with its tray count moved out to the right, lined up under the TRAYS column — so reading straight down that column gives trays for Indi, Small, Large and Boli, and Sicilian is the only one in balls. |
| **1.14.0** | Housekeeping you'll never see, on the machine inside the Dough Log. Three things that could have gone wrong silently now can't. **The date matching is timezone-proof:** if the spreadsheet's time zone had ever drifted from the script's, every save would have quietly added a *new* row for the same day instead of updating the old one, for ever — that's now impossible. **The app refuses to write if a heading has been moved:** rename or reorder a column and it stops and tells you, instead of putting numbers in the wrong place and reporting success. **A stray note typed far down a page** can no longer push the next night's row into a gap. Plus a new **Check the log** item in the Dough Tools menu that looks the whole notebook over and reports anything odd in plain words. |
| **1.13.0** | The maths now matches your other app, night for night. The bible rounds **up** between rows as it always did there — except on a quiet day (both forecasts under $13,000), when it rounds down to the row below, but never shedding more than $400. **Sicilian never drops to nothing:** under 8 on hand and at least 1 gets made. The app now **picks the batch count itself** — a couple of trays past a whole batch rounds down instead of firing up the mixer again, up to five on a quiet day — with Round up / Round down always there to overrule it, plus a new pair for the forecast rounding. Extra trays lean to Large. And sales typed small mean thousands up to 99, not 50, so 75 reads as $75,000. |
| **1.12.0** | The two spreadsheet addresses are now built into the app, and the SETTINGS page is gone. Your phone had stopped working because those addresses were kept on each device separately, and the phone's had been lost — so it said it couldn't reach the spreadsheet while the laptop was fine. Now any phone that opens the app is already connected, with nothing to set up. The trade, chosen knowingly: the addresses are readable in the app's published code, so someone who went looking could read your recorded nights or write junk rows. Nobody can erase anything — that is still a menu item inside the spreadsheet. |
| **1.11.1** | A fix for something 1.11.0 introduced: typing a sheet address into Settings by hand (rather than pasting it) turned the dot red saying the address was wrong — moments after it had been typed correctly — and it stayed red until you touched a dough number. The app no longer tries to save while you are still typing an address. |
| **1.11.0** | LOAD LAST TEMPS is gone. Tapping it didn't just show you the last readings — it filed them as today's, with the current time on them, about a second later. A temperature log has to be measurements actually taken, so every reading is now typed. Also: a mistyped sheet address is told to you in plain words instead of being retried for ever, and the README now says which hand-corrections in the notebook stick (counts and sales) and which get overwritten (the worked-out results). |
| **1.10.0** | OFFLINE — WILL RETRY now means it. Before, a save that failed while your phone still had signal just sat there until you typed something else — the app only ever tried again when you nudged it. It now keeps trying on its own: ten seconds later, then twenty, then forty, easing off to once every five minutes until it gets through, and it stops the moment one lands. It also has a go the moment you come back to the app. Two smaller things: a temperature that can't save no longer makes the dough side look broken, and dates older than three months are cleared off the phone — but only ones the spreadsheet has already confirmed. |
| **1.9.0** | The end-of-night page got the card you asked for: what you have beside what tomorrow needs, size by size, in trays and balls, with a plain-words verdict at the bottom. PM sales is off the screen (still recorded in the sheet). History now shows the last 3 nights instead of 30. |
| **1.8.3** | Sicilian never goes negative on the 2 PM page any more. It is never set out and used the same day, so it just runs out — no negative, nothing in the set-out list, and tomorrow makes plainly what tomorrow needs. |
| **1.8.2** | Checked the app against your real Dough Log for the first time: every tab, every column and every self-building-bible number lines up exactly. Added a test proving "Re-run setup" can never touch a recorded night. |
| **1.8.1** | Tidying up: the leftover branch is gone, so `main` is the only one, and the end-of-night page now says "1 ball" instead of "1 balls". |
| **1.8.0** | A second read-through, aimed at the parts the first one covered least. One real bug: an end-of-night entry on a day with no 2 PM record was filed under the wrong dough bible during peach season. |
| **1.7.0** | A full read-through of every line, and the four real bugs it turned up: the Day's Work card claiming "nothing to make" before anything was counted; LOAD FROM SHEET keeping numbers the sheet doesn't have and marking them saved; a mistyped sheet address hanging Test Connection for ever; and the bible mirror never being sent, which could quietly stall the self-building bible. |
| **1.6.0** | The repo tidied: everything in folders, the finished build's paperwork removed, duplicate code collapsed, this page written. |
| **1.5.0** | The look — the Mise en Place design ported in, on one flat background that a phone's dark mode can't invert. |
| **1.4.0** | Passwords dropped at the owner's request, and the erase button taken off the internet with them. |
| **1.3.0** | The Dough Log rebuilt to the owner's own layout, the app made the only calculator, and the self-building bible added. 36 nights imported. |
| **1.1–1.2** | First two attempts at the owner's sheet layout, ending with the app doing all the maths. |
| **1.0** | Autosave replacing every Save button, blank-vs-zero end to end, the History card, and the offline behaviour. |
| **0.x** | The original build: the engine, the three pages, the two spreadsheets, and going live. |
