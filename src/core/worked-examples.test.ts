/**
 * Fully hand-computed worked examples — the 2 PM and EON sessions chained
 * across the same imaginary day. Every expected value was computed by hand
 * from the REAL bible rows under the set-out/replacement rules; the steps
 * are written out so a human can re-check the arithmetic.
 */
import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation } from './dough';
import { runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';

// ————— Thursday, January 15 2026 (regular season → Bible '26) —————
//
// 2 PM COUNT:            trays  singles   have
//   Indi  (11/tray)        1      4       15
//   Small  (8/tray)        5      3       43
//   Large  (6/tray)        4      2       26
//   Sic  (singles only)    —      1       1
//   Boli  (6/tray)         2      1       13
//
// SALES: today 7.2 → 7,200 · current 4.5 → 4,500 · tomorrow 9.1 → 9,100

const pmInputs = {
  date: '2026-01-15',
  counts: counts({
    indiTrays: 1, indiSingles: 4,
    smallTrays: 5, smallSingles: 3,
    largeTrays: 4, largeSingles: 2,
    sicSingles: 1,
    boliTrays: 2, boliSingles: 1,
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
  });

  it('counts what we have', () => {
    expect(record.have).toEqual({ indi: 15, small: 43, large: 26, sic: 1, boli: 13 });
  });

  it("tonight: salesLeft 2,700 clamps to the bible's lowest row (3,750)", () => {
    expect(record.salesLeft).toBe(2700);
    expect(record.tonightRowMatched?.sales).toBe(3750);
    expect(record.use).toEqual({ indi: 11, small: 52, large: 44, sic: 2 });
  });

  it('left keeps raw negatives — except Sicilian, which floors at 0', () => {
    // Indi 15−11 = 4 · Small 43−52 = −9 · Large 26−44 = −18.
    // Sic 1−2 = −1, but Sicilian is never set out and used the same day, so it
    // just runs out: left 0, nothing to set out, no shortage flag.
    expect(record.left).toEqual({ indi: 4, small: -9, large: -18, sic: 0 });
    // Set out: Small 9 balls → 2 trays (÷8 up) · Large 18 → 3 trays.
    expect(record.setOutBalls).toEqual({ indi: 0, small: 9, large: 18, sic: 0 });
    expect(record.setOutTrays).toEqual({ indi: 0, small: 2, large: 3, sic: 0 });
    expect(record.flags.shortageSizes).toEqual(['small', 'large']);
  });

  it('tomorrow: 9,100 hits an exact row — need 26 / 125 / 117 / 3', () => {
    expect(record.tomorrowRowMatched?.sales).toBe(9100);
    expect(record.need).toEqual({ indi: 26, small: 125, large: 117, sic: 3 });
  });

  it('make = need − left (set-out replaced), then trays round UP', () => {
    // Indi 26−4 = 22 · Small 125−(−9) = 134 · Large 117−(−18) = 135.
    // Sic 3−0 = 3 — the plain need, with no shortfall added back.
    expect(record.make).toEqual({ indi: 22, small: 134, large: 135, sic: 3 });
    // Trays: 22÷11 = 2 · 134÷8 = 16.75 → 17 · 135÷6 = 22.5 → 23 · 3÷3 → 1
    expect(record.trays).toEqual({ indi: 2, small: 17, large: 23, sic: 1 });
    expect(record.sicBalls).toBe(3);
  });

  it('Boli: 13 balls on hand (trays AND singles) → 23 short → 4 trays', () => {
    expect(record.boliTrays).toBe(4);
  });

  it('total 47 trays → 47/11 batches; both choices offered, never auto-picked', () => {
    // 2 + 17 + 23 + 1 + 4 = 47 → 4.27…
    expect(record.totalTrays).toBe(47);
    expect(record.exactBatches).toBeCloseTo(47 / 11, 10);
    expect(record.chosenBatchOption).toBeNull();
  });

  it('round DOWN to 4 batches: drop 3 trays, split 40/60 → Small −1, Large −2', () => {
    const down = record.batchDown!;
    expect(down.batches).toBe(4);
    expect(down.targetTrays).toBe(44);
    expect(down.trayDelta).toBe(-3);
    expect(down.smallTrayDelta).toBe(-1); // round(0.4 × −3) = round(−1.2) = −1
    expect(down.largeTrayDelta).toBe(-2);
    // Small 17−1 = 16 · Large 23−2 = 21. Sum 2+16+21+1+4 = 44 ✓
    expect(down.finalTraysToMake).toEqual({ indi: 2, small: 16, large: 21, sic: 1, boli: 4 });
    expect(down.ballsMade).toEqual({ indi: 22, small: 128, large: 126, sic: 3, boli: 24 });
    expect(down.finalDough).toEqual({
      indiTrays: 3, indiSingles: 4, indiTotal: 37,      // 1+2 · 4 · 15+22
      smallTrays: 21, smallSingles: 3, smallTotal: 171, // 5+16 · 3 · 43+128
      largeTrays: 25, largeSingles: 2, largeTotal: 152, // 4+21 · 2 · 26+126
      sicTotal: 4,                                      // 1+3
      boliTrays: 6, boliSingles: 1, boliTotal: 37,      // 2+4 · 1 · 13+24
    });
  });

  it('round UP to 5 batches: add 8 trays, split 40/60 → Small +3, Large +5', () => {
    const up = record.batchUp!;
    expect(up.batches).toBe(5);
    expect(up.targetTrays).toBe(55);
    expect(up.trayDelta).toBe(8);
    expect(up.smallTrayDelta).toBe(3); // round(0.4 × 8) = round(3.2) = 3
    expect(up.largeTrayDelta).toBe(5);
    // Small 17+3 = 20 · Large 23+5 = 28. Sum 2+20+28+1+4 = 55 ✓
    expect(up.finalTraysToMake).toEqual({ indi: 2, small: 20, large: 28, sic: 1, boli: 4 });
    expect(up.ballsMade).toEqual({ indi: 22, small: 160, large: 168, sic: 3, boli: 24 });
    expect(up.finalDough).toEqual({
      indiTrays: 3, indiSingles: 4, indiTotal: 37,
      smallTrays: 25, smallSingles: 3, smallTotal: 203, // 43+160
      largeTrays: 32, largeSingles: 2, largeTotal: 194, // 4+28 · 26+168
      sicTotal: 4,
      boliTrays: 6, boliSingles: 1, boliTotal: 37,
    });
  });
});

// ————— Same day, closing time. —————
//
// EON COUNT: Indi 3t+1 = 34 · Small 19t+4 = 156 · Large 25t+4 = 154 · Sic 2 · Boli 6t = 36
// Final sales typed as 7.9 → 7,900.

describe('worked example — the EON session', () => {
  const dayRecord = runDoughCalculation(pmInputs, bibles, defaultConfig);
  const record = runEonCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 3, indiSingles: 1,
        smallTrays: 19, smallSingles: 4,
        largeTrays: 25, largeSingles: 4,
        sicSingles: 2,
        boliTrays: 6, boliSingles: 0,
      }),
      finalSalesRaw: 7.9,
    },
    dayRecord,
    bibles,
    defaultConfig,
  );

  it('counts the end-of-night dough', () => {
    expect(record.eonHave).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boli: 36 });
  });

  it('pmSales = final sales − 2 PM current sales: 7,900 − 4,500 = 3,400', () => {
    expect(record.pmSales).toBe(3400);
  });

  it("checks all five sizes against tomorrow — Boli against its 36-ball target", () => {
    // Indi 34−26 = 8 · Small 156−125 = 31 · Large 154−117 = 37 · Sic 2−3 = −1 · Boli 36−36 = 0
    expect(record.needSource).toBe('dayRecord');
    expect(record.eonLeft).toEqual({ indi: 8, small: 31, large: 37, sic: -1 });
    expect(record.boliLeft).toBe(0);
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 1 });
    expect(record.boliTraysShort).toBe(0);
    expect(record.sicBallsShort).toBe(1);
  });
});
