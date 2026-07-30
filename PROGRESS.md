# PROGRESS

- [x] **Phase 1 — Foundation & the calculation engine** · Vite/React/TS skeleton, full dough math in `src/core`, tests green, CLAUDE.md written. Bibles moved to `src/data` unchanged.
- [x] **Phase 2 — Design system + the 2 PM page** · Screenshots in `design/`, palette sampled from them, Fraunces + Space Mono self-hosted, app shell + fully working 2 PM page wired to the engine. Verified in-browser at phone width.
- [x] **Phase 3 — EON page + Station Temps page** · EON with the live 2 PM session as the day record (verdict, PM sales, PM use) plus the manual-forecast path; Station Temps with clock-suggested slot chips, all 8 stations, decimals + negatives. 60 tests green. Save / LOAD LAST TEMPS still disabled until phase 4.
- [x] **Phase 4 — Google Sheets storage, sync, offline queue, Settings** · Pure mapping layer for every tab (25 tests), both Apps Scripts generated (`apps-script/`), save/load/queue services, every button live, AM-use path, LOAD LAST TEMPS, Settings with Test Connection. 85 tests green. Verified offline flows in-browser; real sheet connection happens in phase 5.
- [x] **Phase 5 — Launch + guided setup with the owner** · Live at https://jrkiefer.github.io/Doughalulator-/ (GitHub Pages, deploys on push to main). Both Sheets created, scripts deployed, connections tested, and the owner saved a real 2 PM record and real temps from their phone. SETUP.md is the plain-words diary. Post-launch: layout cleanup pass for small phones (v0.5.0).

**All five phases done — the app is live and in real use.**
