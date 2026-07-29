/**
 * One fully hand-computed worked example per session type — 2 PM, EON, and AM —
 * chained across the same imaginary day so the numbers flow like real life.
 * Every expected value below was computed by hand from the REAL bible rows;
 * the steps are written out so a human can re-check the arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { computeAmUse } from './amUse';
import { runDoughCalculation } from './dough';
import { runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';

// ————— Thursday, January 15 2026 (regular season → Bible '26) —————
//
// 2 PM COUNT:            trays  singles   have (trays × balls-per-tray + singles)
//   Indi  (11/tray)        1      4       1×11 + 4 = 15
//   Small  (8/tray)        5      3       5×8  + 3 = 43
//   Large  (6/tray)        4      2       4×6  + 2 = 26
//   Sic  (singles only)    —      1       1
//   Boil  (6/tray)         2      1       2×6  + 1 = 13
//
// SALES (typed in shorthand):
//   today's forecast 7.2 → 7,200 · current sales 4.5 → 4,500 · tomorrow 9.1 → 9,100

const pmInputs = {
  date: '2026-01-15',
  counts: counts({
    indiTrays: 1,
    indiSingles: 4,
    smallTrays: 5,
    smallSingles: 3,
    largeTrays: 4,
    largeSingles: 2,
    sicSingles: 1,
    boilTrays: 2,
    boilSingles: 1,
  }),
  todayForecastRaw: 7.2,
  currentSalesRaw: 4.5,
  tomorrowForecastRaw: 9.1,
};

describe('worked example — the 2 PM session', () => {
  const record = runDoughCalculation(pmInputs, bibles, defaultConfig);

  it('expands the shorthand sales and picks the regular bible by date', () => {
    expect(record.todayForecast).toBe(7200);
    expect(record.currentSales).toBe(4500);
    expect(record.tomorrowForecast).toBe(9100);
    expect(record.bibleUsed).toBe('regular');
    expect(record.bibleName).toBe("Bible '26");
  });

  it('counts what we have', () => {
    expect(record.have).toEqual({ indi: 15, small: 43, large: 26, sic: 1, boil: 13 });
  });

  it("tonight: salesLeft 2,700 is below the bible's lowest row (3,750) → clamp to it", () => {
    // salesLeft = 7,200 − 4,500 = 2,700. Lowest regular row: 11 / 52 / 44 / 2.
    expect(record.salesLeft).toBe(2700);
    expect(record.tonightRowMatched?.sales).toBe(3750);
    expect(record.use).toEqual({ indi: 11, small: 52, large: 44, sic: 2 });
  });

  it('left = have − use, raw negatives kept as shortage warnings, clamped for the math', () => {
    // Indi 15−11 = 4 · Small 43−52 = −9 · Large 26−44 = −18 · Sic 1−2 = −1
    expect(record.leftRaw).toEqual({ indi: 4, small: -9, large: -18, sic: -1 });
    expect(record.left).toEqual({ indi: 4, small: 0, large: 0, sic: 0 });
    expect(record.flags.shortageSizes).toEqual(['small', 'large', 'sic']);
  });

  it("tomorrow: 9,100 hits an exact row — need 26 / 125 / 117 / 3", () => {
    expect(record.tomorrowRowMatched.sales).toBe(9100);
    expect(record.need).toEqual({ indi: 26, small: 125, large: 117, sic: 3 });
  });

  it('make = need − left, then trays round UP (Sic ÷ 3, shown as balls)', () => {
    // Indi 26−4 = 22 · Small 125−0 = 125 · Large 117−0 = 117 · Sic 3−0 = 3
    expect(record.make).toEqual({ indi: 22, small: 125, large: 117, sic: 3 });
    // Trays: 22÷11 = 2 · 125÷8 = 15.625 → 16 · 117÷6 = 19.5 → 20 · 3÷3 = 1
    expect(record.trays).toEqual({ indi: 2, small: 16, large: 20, sic: 1 });
    expect(record.sicBalls).toBe(3);
  });

  it('Boil skips the bible: 2 trays counted → make 4 to reach the 6-tray target', () => {
    expect(record.boilTrays).toBe(4);
  });

  it('total 43 trays → exactly 43/11 batches; the engine offers BOTH round-down and round-up', () => {
    // 2 + 16 + 20 + 1 + 4 = 43 trays → 43 ÷ 11 = 3.909…
    expect(record.totalTrays).toBe(43);
    expect(record.exactBatches).toBeCloseTo(43 / 11, 10);
    expect(record.chosenBatchOption).toBeNull(); // the owner taps, the engine never picks
  });

  it('round DOWN to 3 batches: drop 10 trays, split 40/60 → Small −4, Large −6', () => {
    const down = record.batchDown;
    expect(down.batches).toBe(3);
    expect(down.targetTrays).toBe(33);
    expect(down.trayDelta).toBe(-10);
    expect(down.smallTrayDelta).toBe(-4);
    expect(down.largeTrayDelta).toBe(-6);
    // Small 16−4 = 12 · Large 20−6 = 14 · rest unchanged. Sum = 2+12+14+1+4 = 33 ✓
    expect(down.finalTraysToMake).toEqual({ indi: 2, small: 12, large: 14, sic: 1, boil: 4 });
    // Balls made: 2×11 = 22 · 12×8 = 96 · 14×6 = 84 · Sic stays 3 balls · 4×6 = 24
    expect(down.ballsMade).toEqual({ indi: 22, small: 96, large: 84, sic: 3, boil: 24 });
    // Final dough: trays = counted + made, singles carry over, total = have + ballsMade.
    expect(down.finalDough).toEqual({
      indiTrays: 3, indiSingles: 4, indiTotal: 37,   // 1+2 · 4 · 15+22
      smallTrays: 17, smallSingles: 3, smallTotal: 139, // 5+12 · 3 · 43+96
      largeTrays: 18, largeSingles: 2, largeTotal: 110, // 4+14 · 2 · 26+84
      sicTotal: 4,                                      // 1+3 (Sic: total only)
      boilTrays: 6, boilSingles: 1, boilTotal: 37,      // 2+4 · 1 · 13+24
    });
  });

  it('round UP to 4 batches: add 1 tray, split 40/60 → Small +0, Large +1', () => {
    const up = record.batchUp;
    expect(up.batches).toBe(4);
    expect(up.targetTrays).toBe(44);
    expect(up.trayDelta).toBe(1);
    expect(up.smallTrayDelta).toBe(0);
    expect(up.largeTrayDelta).toBe(1);
    // Small 16 · Large 20+1 = 21. Sum = 2+16+21+1+4 = 44 ✓
    expect(up.finalTraysToMake).toEqual({ indi: 2, small: 16, large: 21, sic: 1, boil: 4 });
    expect(up.ballsMade).toEqual({ indi: 22, small: 128, large: 126, sic: 3, boil: 24 });
    expect(up.finalDough).toEqual({
      indiTrays: 3, indiSingles: 4, indiTotal: 37,      // 1+2 · 4 · 15+22
      smallTrays: 21, smallSingles: 3, smallTotal: 171, // 5+16 · 3 · 43+128
      largeTrays: 25, largeSingles: 2, largeTotal: 152, // 4+21 · 2 · 26+126
      sicTotal: 4,                                      // 1+3
      boilTrays: 6, boilSingles: 1, boilTotal: 37,      // 2+4 · 1 · 13+24
    });
  });
});

// ————— Same day, closing time. The owner tapped the UP option at 2 PM. —————
//
// EON COUNT:             trays  singles   eonHave
//   Indi                   3      1       34
//   Small                 19      4       156
//   Large                 25      4       154
//   Sic                    —      2       2
//   Boil                   6      0       36
//
// Final sales typed as 7.9 → 7,900.

describe('worked example — the EON session', () => {
  const dayRecord = {
    ...runDoughCalculation(pmInputs, bibles, defaultConfig),
    chosenBatchOption: 'up' as const,
  };
  const record = runEonCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 3,
        indiSingles: 1,
        smallTrays: 19,
        smallSingles: 4,
        largeTrays: 25,
        largeSingles: 4,
        sicSingles: 2,
        boilTrays: 6,
      }),
      finalSalesRaw: 7.9,
    },
    dayRecord,
    bibles,
    defaultConfig,
  );

  it('counts the end-of-night dough', () => {
    expect(record.eonHave).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boil: 36 });
  });

  it('pmSales = final sales − 2 PM current sales: 7,900 − 4,500 = 3,400', () => {
    expect(record.finalSales).toBe(7900);
    expect(record.pmSales).toBe(3400);
  });

  it("tomorrow check against the day's need (26/125/117/3) — Boil never checked", () => {
    // Indi 34−26 = 8 · Small 156−125 = 31 · Large 154−117 = 37 · Sic 2−3 = −1
    expect(record.needSource).toBe('dayRecord');
    expect(record.eonLeft).toEqual({ indi: 8, small: 31, large: 37, sic: -1 });
    // Only Sic is short: 1 ball → ÷3 rounded up = 1 tray, and 1 as balls.
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 1 });
    expect(record.sicBallsShort).toBe(1);
  });

  it("PM use = chosen option's final dough totals (37/171/152/4/37) − eonHave, negatives kept", () => {
    // Indi 37−34 = 3 · Small 171−156 = 15 · Large 152−154 = −2 (miscount → "check count?")
    // Sic 4−2 = 2 · Boil 37−36 = 1
    expect(record.pmUse).toEqual({ indi: 3, small: 15, large: -2, sic: 2, boil: 1 });
    expect(record.flags.negativePmUseSizes).toEqual(['large']);
  });
});

// ————— Friday morning. Yesterday's EON above; fresh morning count below. —————
//
// AM COUNT:              trays  singles   have
//   Indi                   2      8       30
//   Small                 17      4       140
//   Large                 26      4       160
//   Sic                    —      1       1
//   Boil                   5      0       30
//
// Current sales at 2 PM typed as 2.2 → 2,200 (already expanded when AM use runs).

describe('worked example — the AM use calculation', () => {
  const yesterdayEon = runEonCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 3,
        indiSingles: 1,
        smallTrays: 19,
        smallSingles: 4,
        largeTrays: 25,
        largeSingles: 4,
        sicSingles: 2,
        boilTrays: 6,
      }),
      finalSalesRaw: 7.9,
    },
    null,
    bibles,
    defaultConfig,
  );

  it("AM use = yesterday's EON dough (34/156/154/2/36) − this morning's count", () => {
    const result = computeAmUse(
      yesterdayEon,
      { indi: 30, small: 140, large: 160, sic: 1, boil: 30 },
      2200,
    );
    // Indi 34−30 = 4 · Small 156−140 = 16 · Large 154−160 = −6 (negative passes through)
    // Sic 2−1 = 1 · Boil 36−30 = 6
    expect(result).toEqual({
      amSales: 2200,
      amUse: { indi: 4, small: 16, large: -6, sic: 1, boil: 6 },
    });
  });

  it('stays blank (null) when yesterday was a closed day with no EON record', () => {
    expect(
      computeAmUse(null, { indi: 30, small: 140, large: 160, sic: 1, boil: 30 }, 2200),
    ).toBeNull();
  });
});
