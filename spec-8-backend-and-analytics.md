# Spec 8 — Backend Hardening & Sheet-Side Live Analytics

Both Apps Scripts (`apps-script/*/Code.gs`) keep the shared-secret checks, merge-upserts by date, and the hash-guarded bible mirror, and add:

## Hardening

- **Write lock**: every `doPost` runs under `LockService.getScriptLock().tryLock(20s)`; a busy lock answers `{ ok:false, retryable:true }` — network-class to the app — so two phones can never race `findDateRow` into duplicate rows.
- **Validation** (terminal `ok:false` reasons): missing/invalid date; empty saves; unknown tabs/slots; negative numbers where nonsensical — with exactly two exemptions: sales-left may be negative (plus the by-design negative Left/EON Check columns) and station temps may be negative.
- **Tolerant dates**: one `normalizeDate` helper on both sides of every match — ISO, `M/D/YYYY`, and 2-digit years all land on `YYYY-MM-DD`, so hand-typed sheet dates still merge.
- Temps payloads carry a whole day: `{ type:'temps', date, items:[{ time, slot, readings }] }`.

## Live analytics (replaces the snapshot "Actual Use" tab)

- **Dough Use** is formula-driven, installed by `rebuildDoughUse()`: per date, AM use = yesterday's EON have − today's 2 PM have; PM use = the night's Final Dough − that night's EON have (gated by IFERROR so nights without final-dough numbers stay blank — no phantom use); AM/PM sales derive from the Sales/EON tabs. Hand-corrections anywhere recompute everything; negatives render red. The app no longer computes or posts any usage numbers.
- **Fitted bibles** (`New Dough Bible`, `New Peach Bible`): per size and season, a Theil–Sen fit (median of pairwise slopes — outlier nights can't drag it) of actual use vs final sales over recorded history, emitted at the current bibles' sales thresholds beside the current values. Clearly labeled suggestions; read-only; regenerated on demand.
- **🍕 Dough Tools menu** (`onOpen`): re-run setup · rebuild Dough Use formulas · regenerate fitted bibles.

## Backend tests

`apps-script/harness.ts` runs both `.gs` files in-process against stubbed SpreadsheetApp/LockService: lock acquire/release and the busy shape, every validation rejection, merge-upsert, tolerant matching, header/rename integrity, Dough Use formula installation, fitted-bible generation on synthetic history, and a **bible tripwire** that fails if `src/data`'s JSON and the mirror the script writes ever drift.
