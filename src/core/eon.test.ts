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

  it('final sales are expanded from shorthand', () => {
    expect(record.finalSales).toBe(12400);
  });

  it('the tomorrow check covers all five sizes — Boli against its 36-ball target', () => {
    expect(record.boliNeed).toBe(36);
    expect(record.outlook!.rows.boli).toMatchObject({ have: 36, need: 36, diff: 0, trays: 0 });
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
    expect(short.outlook!.rows.boli).toMatchObject({ diff: -9, trays: -2 });
  });

  it('blank final sales stay null, never a fabricated zero', () => {
    const blank = runEon({ counts: eonCounts }, makeDayRecord());
    expect(blank.finalSales).toBeNull();
  });

  it('an uncounted size shows null in the check, not a fake shortage', () => {
    const partial = runEon(
      { counts: counts({ smallTrays: 19, smallSingles: 4 }), finalSalesRaw: 12.4 },
      makeDayRecord(),
    );
    expect(partial.outlook!.rows.small.diff).toBe(31);
    expect(partial.outlook!.rows.indi).toMatchObject({ have: null, diff: null, trays: null });
    expect(partial.outlook!.rows.boli.diff).toBeNull();
  });
});

describe('runEonCalculation without a day record', () => {
  it('no manual forecast → the check is simply unavailable', () => {
    const record = runEon({ counts: eonCounts, finalSalesRaw: 12.4 });
    expect(record.eonHave).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boli: 36 });
    expect(record.need).toBeNull();
    expect(record.outlook).toBeNull();
    expect(record.flags.tomorrowCheckAvailable).toBe(false);
  });

  it('a manual forecast brings the check back (auto bible by date)', () => {
    // July date → peach. 9.7 → 9,700. With no 2 PM record there is no slow-day
    // gate to read, so it rounds UP → the 10,000 peach row: 30/188/137/4.
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
    expect(record.need).toEqual({ indi: 30, small: 188, large: 137, sic: 4 });
    // have 24 / 160 / 120 / 2 against that need
    const r = record.outlook!.rows;
    expect([r.indi.diff, r.small.diff, r.large.diff]).toEqual([-6, -28, -17]);
    expect(r.indi.trays).toBe(-1); // 6/11 = 0.55 → 1
    expect(r.small.trays).toBe(-4); // 28/8 = 3.5 → 4
    expect(r.large.trays).toBe(-3); // 17/6 = 2.83 → 3
    expect(r.sic).toMatchObject({ diff: 0, trays: 0 }); // clamped, never −2
    expect(r.boli).toMatchObject({ diff: 30 - 36, trays: -1 }); // 6/6 = 1
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
    const r = record.outlook!.rows;
    expect([r.indi.diff, r.small.diff, r.large.diff, r.sic.diff]).toEqual([34, 156, 154, 2]);
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
