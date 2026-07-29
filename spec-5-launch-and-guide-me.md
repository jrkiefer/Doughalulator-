# Phase 5 — Launch & Guide the Owner, Live

Goal: the app online, connected to both Sheets, and a REAL test record saved from the owner's phone. This phase is mostly you guiding a person with zero technical knowledge — one step at a time, plain words, wait for "done" after every step.

## Deployment pieces (build these first, yourself)
- `vite.config.ts` with `base: './'`.
- `.github/workflows/deploy.yml`: build and deploy to GitHub Pages on every push to main (official Pages actions).

## Then guide, in this order, one step at a time
1. **Warm-up:** run the full test suite once more; tell the owner in plain words what passed. Start the preview and do a 10-second tour together.
2. **GitHub:** help them sign in (or create the account if they haven't). Create the repository yourself if you can; otherwise walk them through it click by click. Push the code, walking them through any sign-in screens. Explain in one sentence what just happened ("your app's files now live in your online folder").
3. **Turn the website on:** guide them to enable GitHub Pages (Source = GitHub Actions). Wait together until the site is live; have them open the address.
4. **Google Sheet #1:** guide them: create a spreadsheet named "Hot Tomato Dough Log" → Extensions → Apps Script → paste the dough Code.gs (tell them exactly how to copy it) → set the shared secret (generate a good one for them) → run `setup()` → help them through the permissions approval (tell them the scary-looking screen is normal and why) → Deploy as web app (execute as me; anyone with the link) → copy the URL.
5. **Google Sheet #2:** same steps with "Hot Tomato Temp Log" and the temps Code.gs.
6. **Connect:** on the live site, open Settings with them → paste both URLs and both secrets → Test Connection for each → fix anything together until both pass.
7. **The proof:** do one practice 2 PM entry together on their phone → tap a rounding choice → Save → open the Google Sheet together and confirm the row appeared. Then one quick temps save and check the Temp Log.
8. **Phone setup:** show them how to add the site to their phone's home screen so it opens like a real app.
9. **The record:** write **SETUP.md** — a plain-words diary of everything you two just did (accounts, names, where the URLs and secrets are entered), so they can find their way back. Update PROGRESS.md: all phases done.

**Done means:** the owner has saved a real test record from their own phone into their own Sheet, the app is on their home screen, and they never once needed to understand code.
