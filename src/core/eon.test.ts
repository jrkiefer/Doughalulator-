import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation } from './dough';
import { runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';

/** A real 2 PM record to hang EON tests on (details verified in worked-examples.test.ts). */
function makeDayRecord() {
  return runDoughCalculation(
    {
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
      currentSalesRaw: 4.5, // → 4,500
      tomorrowForecastRaw: 9.1, // → 9,100: need 26/125/117/3
    },
    bibles,
    defaultConfig,
  );
}

const eonCounts = counts({
  indiTrays: 3,
  indiSingles: 1, // 34
  smallTrays: 19,
  smallSingles: 4, // 156
  largeTrays: 25,
  largeSingles: 4, // 154
  sicSingles: 2,
  boilTrays: 6, // 36
});

describe('runEonCalculation with a day record', () => {
  const dayRecord = { ...makeDayRecord(), chosenBatchOption: 'up' as const };
  const record = runEonCalculation(
    { date: '2026-01-15', counts: eonCounts, finalSalesRaw: 12.4 },
    dayRecord,
    bibles,
    defaultConfig,
  );

  it('pmSales comes from shorthand final sales minus 2 PM current sales', () => {
    expect(record.finalSales).toBe(12400); // 12.4 expanded
    expect(record.pmSales).toBe(12400 - 4500);
  });

  it('the tomorrow check covers Indi/Small/Large/Sic and NEVER Boil', () => {
    expect(record.eonLeft).toEqual({ indi: 8, small: 31, large: 37, sic: -1 });
    expect(record.eonLeft).not.toHaveProperty('boil');
    expect(record.traysShort).not.toHaveProperty('boil');
  });

  it('reports trays short rounded up per size, with Sic in make-trays of 3 AND as balls', () => {
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 1 }); // 1 ball short → 1 tray
    expect(record.sicBallsShort).toBe(1);
  });

  it('pmUse covers all five sizes and lets negatives pass through', () => {
    // Chosen (up) final dough totals: 37/171/152/4/37 (worked example).
    expect(record.pmUse).toEqual({ indi: 3, small: 15, large: -2, sic: 2, boil: 1 });
    expect(record.flags.negativePmUseSizes).toEqual(['large']);
    expect(record.flags.pmUseAvailable).toBe(true);
  });

  it('pmUse stays unavailable until the owner has tapped a batch option', () => {
    const untapped = runEonCalculation(
      { date: '2026-01-15', counts: eonCounts, finalSalesRaw: 12.4 },
      makeDayRecord(), // chosenBatchOption is still null
      bibles,
      defaultConfig,
    );
    expect(untapped.pmUse).toBeNull();
    expect(untapped.flags.pmUseAvailable).toBe(false);
  });
});

describe('runEonCalculation without a day record', () => {
  it('still counts dough and takes final sales; everything else flagged unavailable', () => {
    const record = runEonCalculation(
      { date: '2026-01-15', counts: eonCounts, finalSalesRaw: 12.4 },
      null,
      bibles,
      defaultConfig,
    );
    expect(record.eonHave).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boil: 36 });
    expect(record.finalSales).toBe(12400);
    expect(record.pmSales).toBeNull();
    expect(record.need).toBeNull();
    expect(record.pmUse).toBeNull();
    expect(record.flags).toEqual({
      pmSalesAvailable: false,
      tomorrowCheckAvailable: false,
      pmUseAvailable: false,
      negativePmUseSizes: [],
    });
  });

  it('a manually-entered tomorrow forecast brings the check back (auto bible by date)', () => {
    // July date → peach bible. 9.7 → 9,700, between 9,500 and 10,000, below 10k → DOWN
    // → the 9,500 peach row: need 29/179/133/4.
    const record = runEonCalculation(
      {
        date: '2026-07-15',
        counts: counts({
          indiTrays: 2,
          indiSingles: 2, // 24
          smallTrays: 20, // 160
          largeTrays: 20, // 120
          sicSingles: 2,
          boilTrays: 5, // 30
        }),
        finalSalesRaw: 12.4,
        manualTomorrowForecastRaw: 9.7,
      },
      null,
      bibles,
      defaultConfig,
    );
    expect(record.needSource).toBe('manualForecast');
    expect(record.manualTomorrowForecast).toBe(9700);
    expect(record.bibleUsed).toBe('peach');
    expect(record.tomorrowRowMatched?.sales).toBe(9500);
    expect(record.need).toEqual({ indi: 29, small: 179, large: 133, sic: 4 });
    // eonLeft: 24−29=−5 · 160−179=−19 · 120−133=−13 · 2−4=−2
    expect(record.eonLeft).toEqual({ indi: -5, small: -19, large: -13, sic: -2 });
    // Trays short rounded up: 5÷11→1 · 19÷8→3 · 13÷6→3 · 2÷3→1 (and 2 as balls).
    expect(record.traysShort).toEqual({ indi: 1, small: 3, large: 3, sic: 1 });
    expect(record.sicBallsShort).toBe(2);
    expect(record.flags.tomorrowCheckAvailable).toBe(true);
    // Still no day record, so PM sales/use stay unavailable.
    expect(record.pmSales).toBeNull();
    expect(record.pmUse).toBeNull();
  });
});
