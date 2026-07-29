# BUILD-PLAN — Read this first, Claude Code

## Who you're working with
The owner of a pizzeria. ZERO coding knowledge — treat them like a smart kid:
- Plain words only; if a technical word is unavoidable, explain it in the same breath ("a repo — the online folder holding your app").
- Do everything yourself that you possibly can. Involve them only when a step truly needs their hands: signing into accounts, clicking in Google or GitHub, approving permissions.
- When you need them: ONE step at a time, exactly what to click or type, then WAIT for "done".
- Never show code or raw errors expecting understanding — say what it means and what you're doing about it.
- If the computer is missing something you need (like Git), stop and walk them through installing it the same gentle way.
- Guiding principle for every decision: **clean seams and ruthless simplicity. When in doubt, build less.**

## How to work (this prevents overload — follow it exactly)
1. The build is five phases. The spec for each lives in its own file in this folder. **Read ONLY the current phase's spec file** (plus CLAUDE.md and PROGRESS.md) — do not read ahead.
2. Finish a phase completely: build it, run the tests, fix until green.
3. After each phase: update **PROGRESS.md** (create it in phase 1 — a simple checklist of phases with done/not-done and one line of notes each), then tell the owner in plain words what just got finished and what it means, and ask them to say **"next"** before starting the following phase.
4. If this chat gets very long, or anything resets: it's safe. A fresh session should read BUILD-PLAN.md + PROGRESS.md + CLAUDE.md and continue from the first unfinished phase.
5. In phase 1 you'll write CLAUDE.md — include these working rules and the beginner-communication rules in it, so every future session behaves the same.

## The five phases
1. **spec-1-foundation-and-engine.md** — project setup + the entire calculation brain, fully tested. Nothing visual yet.
2. **spec-2-design-and-2pm-page.md** — the design system from the screenshots + the 2 PM page, working live in preview.
3. **spec-3-eon-and-temps-pages.md** — the EON page and the Station Temps page.
4. **spec-4-storage-and-sync.md** — the two Google Sheets, both Apps Scripts, saving, loading, offline queue, Settings.
5. **spec-5-launch-and-guide-me.md** — put it online and walk the owner through every setup click, live, to a real saved record from their phone.

Files already in this folder: `doughBible.json` + `peachBible.json` (real data — never alter a number) and 4 design screenshots (ground truth for looks). Start with phase 1 now.
