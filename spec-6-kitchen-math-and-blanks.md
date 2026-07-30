# Spec 6 — Kitchen Math Parity & Blank-vs-Zero

The size's old misspelling is gone — it has always been **Boli**. Renamed across code, UI, sheet headers, docs, and tests; the local cache moved to a v2 prefix so pre-rename phone caches are discarded, never half-read.

## Blank ≠ zero (cross-cutting)

An untouched field means "not counted / not entered"; a typed 0 is a real zero.

- Form state keeps raw strings; `toNumOrNull` maps `''` → null, `'0'` → 0.
- A fully blank size contributes nothing to use/left/make and renders "—". Within a size that has any entered field, blank siblings count as 0.
- A blank Boli count is "not counted": excluded from top-up and total trays, captioned, batches still compute from the counted sizes.
- Blank tomorrow forecast → no need, no make, no batch cards. Payloads carry blanks as **empty cells** (clearing them on the sheet), and loading hydrates blanks back as blanks, zeros as `'0'`.

## Closed tomorrow

An explicitly typed tomorrow forecast of `0` = closed: need/make/trays are 0 for every size **including Boli**, total trays 0, no batch choice shown, `closedTomorrow` flag, "Closed" in the Sales tab's matched-row cell. The EON manual-forecast path honors the same rule (manual 0 → zero need, Boli target 0).

## Set-out and replacement

When tonight's projected use exceeds a counted size, `left` keeps the raw negative. The UI says **"set out N trays tonight"** (shortfall balls ÷ that size's tray, rounded up; Sic in make-trays of 3), and tomorrow's make = need − left (with left negative, the set-out dough is replaced) floored at zero **after** the subtraction — dough conserves. The old clamp-then-flag is gone; `shortageSizes` remains as a "check your count" hint and the Left sheet tab stores raw negatives.

## Sicilian

No minimum, no display hint, no special EON clamp. make = need − left floored at zero, like every size; EON shortfalls report full strength.

## Boli top-up

Target six trays = 36 balls. On-hand counts **trays and singles**. Shortfall rounds up to whole trays; never negative; zero on a closed tomorrow. The EON check includes Boli against the 36-ball target (0 when closed) — owner-changeable default, see PROGRESS.md.

## Batches

Two options, owner always taps, engine never picks. Round-down is floored at **1 batch** whenever total trays > 0; with total trays 0 no choice is offered at all. The 40/60 Small/Large adjustment is unchanged, except the delta goes wholly to the only counted one of the pair.

The slow-day system from the predecessor (under-$12k gate, drop cap, auto round-down) is deliberately absent.
