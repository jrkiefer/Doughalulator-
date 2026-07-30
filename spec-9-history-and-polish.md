# Spec 9 — History, Peach Toggle & Polish

## History card

Collapsed by default; roughly the last 30 nights: date, final sales when known, batches made, a red shortage dot. Paints from the phone cache instantly, refreshes via the dough script's `recent` GET, caches the result so it works offline. Tapping a row navigates to that date.

## Peach-season quick toggle

The bible toggle appears only inside the config-driven peach window, auto-selected by date, tappable to override per record. The override is stored with the record (recovered from the sheet's `Bible Used` column on load) and honored by every lookup, including the EON manual forecast.

## Polish

- Viewport zoom lock (`maximum-scale=1, user-scalable=no`) for floury hands.
- Input hardening: digits-only filtering with caret preservation; decimal point only on sales and temps; a single leading minus only on station-temp fields; `inputMode` hints kept correct.
- Dollar echo under every sales field: "10 → $10,000", live as typed.
- Collapsible cards (History, Temps, the bible viewer) collapsed by default, remembered per session.
- Visible version tag in the footer from the single source of truth (`package.json`).
- ESLint (TS + React Hooks presets) with `npm run lint` wired into CI beside typecheck/test/build.
