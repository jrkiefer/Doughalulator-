import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation } from './dough';
import { computeAmUse, runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';
import type { EonInputs, PerSizeMaybe } from './types';

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
    expect(record.outlook!.rows.boli.trays).toBe(0);
  });

  it('the outlook gives each size the gap in balls and in nearest trays', () => {
    const r = record.outlook!.rows;
    expect(r.indi).toMatchObject({ have: 34, need: 26, diff: 8, trays: 1 }); // 8/11 → 1
    expect(r.small).toMatchObject({ diff: 31, trays: 4 }); // 31/8 = 3.875 → 4
    expect(r.large).toMatchObject({ diff: 37, trays: 6 }); // 37/6 = 6.17 → 6
    // Sicilian bottoms out at 0 rather than showing −1.
    expect(r.sic).toMatchObject({ have: 2, need: 3, diff: 0, trays: 0 });
  });

  it('a short Boli count reports trays short toward the target', () => {
    const short = runEon(
      { counts: { ...eonCounts, boliTrays: 4, boliSingles: 3 }, finalSalesRaw: 12.4 },
      makeDayRecord(),
    );
    // 27 balls − 36 target = −9 → nearest tray is −2 (9/6 = 1.5 → 2).
    expect(short.boliLeft).toBe(-9);
    expect(short.outlook!.rows.boli).toMatchObject({ diff: -9, trays: -2 });
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
    expect(partial.outlook!.rows.indi).toMatchObject({ have: null, diff: null, trays: null });
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
    const r = record.outlook!.rows;
    expect(r.indi.trays).toBe(0); // 5/11 = 0.45 → nearest tray is none
    expect(r.small.trays).toBe(-2); // 19/8 = 2.375 → 2
    expect(r.large.trays).toBe(-2); // 13/6 = 2.17 → 2
    expect(r.sic).toMatchObject({ diff: 0, trays: 0 }); // clamped, never −2
    expect(record.boliLeft).toBe(30 - 36);
    expect(r.boli.trays).toBe(-1); // 6/6 = 1
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
    expect(record.outlook!.shortfallBalls).toBe(0);
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
    expect(record.outlook!.shortfallBalls).toBe(0);
  });
});

describe("the outlook, checked against the owner's own mockup", () => {
  // Every figure below is read straight off the card the owner sent. If the
  // port of their app's computeOutlook is faithful, these fall out exactly:
  //   INDI 55 vs 29 → +2 tr / +26 balls      SM  209 vs 179 → +4 tr / +30 balls
  //   LG  171 vs 133 → +6 tr / +38 balls     SIC   4 vs 4   → 0 balls
  //   BOIL 36 vs 36  →  0 tr /  0 balls
  //   "Dough is good ✓ — ~12 trays leftover (94 balls)."
  const MOCKUP = [
    { key: 'indi', have: 55, need: 29, diff: 26, trays: 2 },
    { key: 'small', have: 209, need: 179, diff: 30, trays: 4 },
    { key: 'large', have: 171, need: 133, diff: 38, trays: 6 },
    { key: 'sic', have: 4, need: 4, diff: 0, trays: 0 },
    { key: 'boli', have: 36, need: 36, diff: 0, trays: 0 },
  ] as const;

  // 9.5 → 9,500 on the peach bible gives exactly the mockup's needs.
  const record = runEon({
    date: '2026-07-15',
    counts: counts({
      indiSingles: 55, smallSingles: 209, largeSingles: 171, sicSingles: 4, boliSingles: 36,
    }),
    finalSalesRaw: 12.4,
    manualTomorrowForecastRaw: 9.5,
  });

  it('reads the needs the mockup shows', () => {
    expect(record.need).toEqual({ indi: 29, small: 179, large: 133, sic: 4 });
    expect(record.boliNeed).toBe(36);
  });

  it.each(MOCKUP)('$key: $have vs $need → $trays tr / $diff balls', (row) => {
    expect(record.outlook!.rows[row.key]).toEqual({
      have: row.have,
      need: row.need,
      diff: row.diff,
      trays: row.trays,
    });
  });

  it('totals to the mockup\'s "~12 trays leftover (94 balls)"', () => {
    expect(record.outlook!.surplusTrays).toBe(12);
    expect(record.outlook!.surplusBalls).toBe(94);
    expect(record.outlook!.shortfallBalls).toBe(0);
    expect(record.outlook!.anyCounted).toBe(true);
  });
});

describe('the outlook forecast box overrides the 2 PM figure', () => {
  it('a typed forecast wins, and clearing it hands back to the 2 PM save', () => {
    const day = makeDayRecord();
    const fromDay = runEon({ counts: eonCounts, finalSalesRaw: 12.4 }, day);
    expect(fromDay.needSource).toBe('dayRecord');

    const typed = runEon(
      { counts: eonCounts, finalSalesRaw: 12.4, manualTomorrowForecastRaw: 20 },
      day,
    );
    expect(typed.needSource).toBe('manualForecast');
    expect(typed.need).not.toEqual(fromDay.need);

    // Cleared (null) → straight back to the afternoon's figure.
    const cleared = runEon(
      { counts: eonCounts, finalSalesRaw: 12.4, manualTomorrowForecastRaw: null },
      day,
    );
    expect(cleared.needSource).toBe('dayRecord');
    expect(cleared.need).toEqual(fromDay.need);
  });

  it('a typed 0 still means closed tomorrow, even with a 2 PM forecast set', () => {
    const record = runEon(
      { counts: eonCounts, finalSalesRaw: 12.4, manualTomorrowForecastRaw: 0 },
      makeDayRecord(),
    );
    expect(record.flags.closedTomorrow).toBe(true);
    expect(record.need).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
  });
});

describe('dough used before 2 PM (computeAmUse)', () => {
  const have = (over: Partial<PerSizeMaybe> = {}): PerSizeMaybe => ({
    indi: 40, small: 200, large: 150, sic: 6, boli: 30, ...over,
  });

  it('is last night’s close less this afternoon’s count, per size', () => {
    const am = computeAmUse(have(), have({ indi: 25, small: 160, large: 120, sic: 4, boli: 24 }), 3000);
    expect(am.sales).toBe(3000);
    expect(am.use).toEqual({ indi: 15, small: 40, large: 30, sic: 2, boli: 6 });
  });

  it('a day whose yesterday never closed out has no morning use at all', () => {
    const am = computeAmUse(null, have(), 3000);
    expect(am.use).toEqual({ indi: null, small: null, large: null, sic: null, boli: null });
    expect(am.sales).toBe(3000); // the sales figure is still known
  });

  it('a count that went UP overnight is a miscount, not negative use', () => {
    const am = computeAmUse(have({ small: 100 }), have({ small: 160 }), 3000);
    expect(am.use.small).toBeNull();
    expect(am.use.indi).toBe(0); // the sizes that did not move still read zero
  });

  it('a size either side never counted stays blank', () => {
    const am = computeAmUse(have({ sic: null }), have({ boli: null }), 3000);
    expect(am.use.sic).toBeNull();
    expect(am.use.boli).toBeNull();
    expect(am.use.indi).toBe(0);
  });
});

describe('dough used after 2 PM (pmUse on the EON record)', () => {
  it('is the night’s final dough less the closing count', () => {
    const day = { ...dayRecordFor(), chosenBatchOption: 'up' as const };
    const final = day.batchUp!.finalDough;
    const record = runEonCalculation(
      {
        date: '2026-01-15',
        counts: counts({
          indiSingles: (final.indiTotal ?? 0) - 10,
          smallSingles: (final.smallTotal ?? 0) - 30,
          largeSingles: (final.largeTotal ?? 0) - 20,
          sicSingles: (final.sicTotal ?? 0) - 1,
          boliSingles: (final.boliTotal ?? 0) - 6,
        }),
        finalSalesRaw: 9000,
      },
      day,
      bibles,
      defaultConfig,
    );
    expect(record.pmUse).toEqual({ indi: 10, small: 30, large: 20, sic: 1, boli: 6 });
  });

  it('without a tapped batch choice there is no final dough to measure against', () => {
    const record = runEonCalculation(
      { date: '2026-01-15', counts: counts({ indiSingles: 10 }), finalSalesRaw: 9000 },
      { ...dayRecordFor(), chosenBatchOption: null },
      bibles,
      defaultConfig,
    );
    expect(record.pmUse).toBeNull();
  });

  it('a closing count above the final dough is a miscount, left blank', () => {
    const day = { ...dayRecordFor(), chosenBatchOption: 'up' as const };
    const record = runEonCalculation(
      {
        date: '2026-01-15',
        counts: counts({ indiSingles: (day.batchUp!.finalDough.indiTotal ?? 0) + 5 }),
        finalSalesRaw: 9000,
      },
      day,
      bibles,
      defaultConfig,
    );
    expect(record.pmUse!.indi).toBeNull();
  });
});

function dayRecordFor() {
  return runDoughCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiSingles: 15, smallSingles: 43, largeSingles: 26, sicSingles: 1, boliSingles: 13,
      }),
      todayForecastRaw: 7200,
      currentSalesRaw: 4500,
      tomorrowForecastRaw: 9100,
    },
    bibles,
    defaultConfig,
  );
}
