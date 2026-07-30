import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation } from './dough';
import { runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';
import type { EonInputs } from './types';

function runEon(partial: Partial<EonInputs>, dayRecord: Parameters<typeof runEonCalculation>[1] = null) {
  return runEonCalculation(
    {
      date: '2026-01-15',
      counts: counts(),
      finalSalesRaw: null,
      ...partial,
    },
    dayRecord,
    bibles,
    defaultConfig,
  );
}

/** A real 2 PM record to hang EON tests on (verified in worked-examples.test.ts). */
function makeDayRecord() {
  return runDoughCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 1, indiSingles: 4, smallTrays: 5, smallSingles: 3,
        largeTrays: 4, largeSingles: 2, sicSingles: 1, boliTrays: 2, boliSingles: 1,
      }),
      todayForecastRaw: 7.2,
      currentSalesRaw: 4.5,
      tomorrowForecastRaw: 9.1, // → 9,100: need 26/125/117/3
    },
    bibles,
    defaultConfig,
  );
}

const eonCounts = counts({
  indiTrays: 3, indiSingles: 1, // 34
  smallTrays: 19, smallSingles: 4, // 156
  largeTrays: 25, largeSingles: 4, // 154
  sicSingles: 2,
  boliTrays: 6, boliSingles: 0, // 36
});

describe('runEonCalculation with a day record', () => {
  const record = runEon({ counts: eonCounts, finalSalesRaw: 12.4 }, makeDayRecord());

  it('pmSales comes from shorthand final sales minus 2 PM current sales', () => {
    expect(record.finalSales).toBe(12400);
    expect(record.pmSales).toBe(12400 - 4500);
  });

  it('the tomorrow check now covers all five sizes — Boli against its 36-ball target', () => {
    expect(record.eonLeft).toEqual({ indi: 8, small: 31, large: 37, sic: -1 });
    expect(record.boliNeed).toBe(36);
    expect(record.boliLeft).toBe(0); // exactly six trays on hand
    expect(record.boliTraysShort).toBe(0);
  });

  it('reports trays short rounded up per size, with Sic in make-trays of 3 AND as balls', () => {
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 1 });
    expect(record.sicBallsShort).toBe(1);
  });

  it('a short Boli count reports trays short toward the target', () => {
    const short = runEon(
      { counts: { ...eonCounts, boliTrays: 4, boliSingles: 3 }, finalSalesRaw: 12.4 },
      makeDayRecord(),
    );
    // 27 balls − 36 target = −9 → 2 trays short (ceil 9/6).
    expect(short.boliLeft).toBe(-9);
    expect(short.boliTraysShort).toBe(2);
  });

  it('blank final sales → pmSales stays null', () => {
    const blank = runEon({ counts: eonCounts }, makeDayRecord());
    expect(blank.finalSales).toBeNull();
    expect(blank.pmSales).toBeNull();
  });

  it('an uncounted size shows null in the check, not a fake shortage', () => {
    const partial = runEon(
      { counts: counts({ smallTrays: 19, smallSingles: 4 }), finalSalesRaw: 12.4 },
      makeDayRecord(),
    );
    expect(partial.eonLeft!.small).toBe(31);
    expect(partial.eonLeft!.indi).toBeNull();
    expect(partial.traysShort!.indi).toBeNull();
    expect(partial.boliLeft).toBeNull();
  });
});

describe('runEonCalculation without a day record', () => {
  it('no manual forecast → the check is simply unavailable', () => {
    const record = runEon({ counts: eonCounts, finalSalesRaw: 12.4 });
    expect(record.eonHave).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boli: 36 });
    expect(record.pmSales).toBeNull();
    expect(record.need).toBeNull();
    expect(record.flags.tomorrowCheckAvailable).toBe(false);
  });

  it('a manual forecast brings the check back (auto bible by date)', () => {
    // July date → peach. 9.7 → 9,700 → DOWN → the 9,500 peach row: 29/179/133/4.
    const record = runEon({
      date: '2026-07-15',
      counts: counts({
        indiTrays: 2, indiSingles: 2, smallTrays: 20, smallSingles: 0,
        largeTrays: 20, largeSingles: 0, sicSingles: 2, boliTrays: 5, boliSingles: 0,
      }),
      finalSalesRaw: 12.4,
      manualTomorrowForecastRaw: 9.7,
    });
    expect(record.needSource).toBe('manualForecast');
    expect(record.bibleUsed).toBe('peach');
    expect(record.need).toEqual({ indi: 29, small: 179, large: 133, sic: 4 });
    expect(record.eonLeft).toEqual({ indi: -5, small: -19, large: -13, sic: -2 });
    expect(record.traysShort).toEqual({ indi: 1, small: 3, large: 3, sic: 1 });
    expect(record.sicBallsShort).toBe(2);
    expect(record.boliLeft).toBe(30 - 36);
    expect(record.boliTraysShort).toBe(1);
  });

  it('a manual forecast of 0 means closed tomorrow: zero need everywhere including Boli', () => {
    const record = runEon({
      counts: eonCounts,
      finalSalesRaw: 3.1,
      manualTomorrowForecastRaw: 0,
    });
    expect(record.flags.closedTomorrow).toBe(true);
    expect(record.need).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.boliNeed).toBe(0);
    expect(record.eonLeft).toEqual({ indi: 34, small: 156, large: 154, sic: 2 });
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.boliTraysShort).toBe(0);
  });

  it('a day record whose tomorrow was 0 carries closed-tomorrow into the EON check', () => {
    const closedDay = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ smallTrays: 5 }),
        todayForecastRaw: 5.2,
        currentSalesRaw: 2.2,
        tomorrowForecastRaw: 0,
      },
      bibles,
      defaultConfig,
    );
    const record = runEon({ counts: eonCounts, finalSalesRaw: 6.0 }, closedDay);
    expect(record.flags.closedTomorrow).toBe(true);
    expect(record.boliNeed).toBe(0);
    expect(record.traysShort).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
  });
});
