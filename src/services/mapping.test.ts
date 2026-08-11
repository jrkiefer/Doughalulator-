import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation, runEonCalculation } from '../core';
import { bibles, counts } from '../core/testHelpers';
import {
  biblesToPayload,
  countsRowToFields,
  dayRecordToTabWrites,
  eonCountRowToFinalSales,
  eonRecordToTabWrites,
  hashString,
  salesRowToBible,
  salesRowToFields,
  summaryRowsToHistory,
  summaryRowToRounding,
  tempsLogRows,
  tempsOverviewRows,
  tempsStationWrites,
  tempsToPayload,
} from './mapping';

/** The worked example: Jan 15, regular bible, owner tapped UP. */
const baseRecord = runDoughCalculation(
  {
    date: '2026-01-15',
    counts: counts({
      indiTrays: 1, indiSingles: 4, smallTrays: 5, smallSingles: 3,
      largeTrays: 4, largeSingles: 2, sicSingles: 1, boliTrays: 2, boliSingles: 1,
    }),
    todayForecastRaw: 7.2,
    currentSalesRaw: 4.5,
    tomorrowForecastRaw: 9.1,
  },
  bibles,
  defaultConfig,
);
const dayRecord = { ...baseRecord, chosenBatchOption: 'up' as const };

const eonRecord = runEonCalculation(
  {
    date: '2026-01-15',
    counts: counts({
      indiTrays: 3, indiSingles: 1, smallTrays: 19, smallSingles: 4,
      largeTrays: 25, largeSingles: 4, sicSingles: 2, boliTrays: 6, boliSingles: 0,
    }),
    finalSalesRaw: 7.9,
  },
  dayRecord,
  bibles,
  defaultConfig,
);


describe('dayRecordToTabWrites — the whole afternoon, tab by tab', () => {
  it('writes the count, both bible lookups, the make and the batching', () => {
    const writes = dayRecordToTabWrites(dayRecord);
    expect(writes.map((w) => w.tab)).toEqual([
      '2PM Dough Count',
      'Look up Dough Use for PM',
      'Look up Dough Use Tomorrow',
      'Dough Make (estimate)',
      'Final Make Amount',
      'Estimated Dough After Gang',
    ]);
    // Google truncates a tab name at 31 characters; two that truncate alike
    // silently collide, which is how the previous build lost a whole tab.
    writes.forEach((w) => expect(w.tab.length).toBeLessThanOrEqual(31));

    const row = (tab: string) => writes.find((w) => w.tab === tab)!.row;
    expect(row('2PM Dough Count')).toEqual({
      Date: '2026-01-15',
      "Today's Forecast": 7200,
      'Current Sales': 4500,
      'Sales Left': 2700,
      "Tomorrow's Forecast": 9100,
      'Indi Count': 15,
      'Small Count': 43,
      'Large Count': 26,
      'Sic Count': 1,
      'Boli Count': 13,
      Bible: 'regular',
      'Forecast Rounding': 'down', // 2,700 is below the 10,000 threshold
      'Batch Rounding': 'up',
    });

    // Tonight's use and tomorrow's need are the engine's, not re-derived.
    expect(row('Look up Dough Use for PM')).toMatchObject({
      Indi: dayRecord.use.indi, Small: dayRecord.use.small, 'Sales Left': 2700,
    });
    expect(row('Look up Dough Use Tomorrow')).toMatchObject({
      Indi: dayRecord.need.indi, "Tomorrow's Forecast": 9100,
    });
    expect(row('Dough Make (estimate)')).toMatchObject({
      'Indi Trays': dayRecord.trays.indi,
      'Sic (balls)': dayRecord.sicBalls,
      'Boli Trays': dayRecord.boliTrays,
      'Trays Total': dayRecord.totalTrays,
      Batches: dayRecord.batchUp!.batches,
    });
    expect(row('Final Make Amount')).toMatchObject({
      'Small Trays': dayRecord.batchUp!.finalTraysToMake.small,
    });
    expect(row('Estimated Dough After Gang')).toMatchObject({
      Indi: dayRecord.batchUp!.finalDough.indiTotal,
      Boli: dayRecord.batchUp!.finalDough.boliTotal,
    });
  });

  it('a blank count stays an empty cell — never a fabricated zero', () => {
    const partial = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ smallSingles: 40, sicSingles: 0 }),
        todayForecastRaw: 7.2,
        currentSalesRaw: 4.5,
        tomorrowForecastRaw: 9.1,
      },
      bibles,
      defaultConfig,
    );
    const row = dayRecordToTabWrites(partial)[0].row;
    expect(row['Small Count']).toBe(40);
    expect(row['Sic Count']).toBe(0); // a typed zero is a real zero
    expect(row['Indi Count']).toBe(''); // never counted → blank
  });

  it('the batch-dependent tabs wait until a choice is tapped', () => {
    const writes = dayRecordToTabWrites({ ...dayRecord, chosenBatchOption: null });
    expect(writes.map((w) => w.tab)).not.toContain('Final Make Amount');
    expect(writes.map((w) => w.tab)).not.toContain('Estimated Dough After Gang');
    const make = writes.find((w) => w.tab === 'Dough Make (estimate)')!.row;
    expect(make.Batches).toBe(''); // trays are known; the batch count is not
    expect(make['Trays Total']).toBe(dayRecord.totalTrays);
  });

  it('the morning use rides with the 2 PM save when yesterday closed out', () => {
    const amUse = {
      sales: 4500,
      use: { indi: 5, small: 12, large: 9, sic: 1, boli: null },
    };
    const row = dayRecordToTabWrites(dayRecord, amUse).find((w) => w.tab === 'AM Dough Use')!.row;
    expect(row).toEqual({
      Date: '2026-01-15',
      'AM Sales $': 4500,
      'AM Indi Use': 5,
      'AM Small Use': 12,
      'AM Large Use': 9,
      'AM Sic Use': 1,
      'Bible Used': 'regular',
    });
    // No yesterday → no row at all, rather than a row of zeros.
    expect(dayRecordToTabWrites(dayRecord).map((w) => w.tab)).not.toContain('AM Dough Use');
  });
});

describe('eonRecordToTabWrites — the close, and what the night used', () => {
  it('writes the final count and the PM use', () => {
    const writes = eonRecordToTabWrites(eonRecord, 'regular');
    expect(writes.map((w) => w.tab)).toContain('EON Dough Count');
    const eon = writes.find((w) => w.tab === 'EON Dough Count')!.row;
    expect(eon).toEqual({
      Date: '2026-01-15',
      'EON Sales': 7900,
      'EON Indi Count': 34,
      'EON Small Count': 156,
      'EON Large Count': 154,
      'EON Sic Count': 2,
    });
  });
});

describe('bible mirror payload + hash gate', () => {
  it('is deterministic and carries the full tables', () => {
    const a = biblesToPayload(bibles);
    expect(a.hash).toBe(biblesToPayload(bibles).hash);
    expect(a.bibles.dough.rows).toHaveLength(27);
    expect(a.bibles.peach.rows).toHaveLength(30);
    expect(a.bibles.dough.rows[0]).toEqual([3750, 11, 52, 44, 2]);
  });

  it('the hash changes when any number changes', () => {
    const tampered = structuredClone(bibles);
    tampered.regular.rows[0].small = 53;
    expect(biblesToPayload(tampered).hash).not.toBe(biblesToPayload(bibles).hash);
  });

  it('hashString is stable', () => {
    expect(hashString('dough')).toBe(hashString('dough'));
    expect(hashString('dough')).not.toBe(hashString('douhg'));
  });
});

describe('temps mapping', () => {
  const payload = tempsToPayload(
    '2026-07-29',
    '14:05',
    'midday',
    { 'Pizza 1': '38.5', Freezer: '-4', Salad: '   ', 'Walk-In': 'abc' },
    defaultConfig,
  );

  it('skips empty and junk stations, uses the display slot name', () => {
    expect(payload.slot).toBe('2 PM');
    expect(payload.readings).toEqual([
      { station: 'Pizza 1', temp: 38.5 },
      { station: 'Freezer', temp: -4 },
    ]);
  });

  it('Log rows append one audit line per reading with the clock time', () => {
    expect(tempsLogRows(payload)).toEqual([
      ['2026-07-29', '14:05', '2 PM', 'Pizza 1', 38.5],
      ['2026-07-29', '14:05', '2 PM', 'Freezer', -4],
    ]);
  });

  it('station tabs get a merge write touching only the submitted slot column', () => {
    expect(tempsStationWrites(payload)).toEqual([
      { tab: 'Pizza 1', row: { Date: '2026-07-29', '2 PM': 38.5 } },
      { tab: 'Freezer', row: { Date: '2026-07-29', '2 PM': -4 } },
    ]);
  });

  it('Overview refresh rows carry station, temp, slot, and when', () => {
    expect(tempsOverviewRows(payload)).toEqual([
      ['Pizza 1', 38.5, '2 PM', '2026-07-29 14:05'],
      ['Freezer', -4, '2 PM', '2026-07-29 14:05'],
    ]);
  });
});

describe('reverse mapping (loading)', () => {
  it('a 2 PM row hydrates back into the form — counts land as ball totals', () => {
    const row = dayRecordToTabWrites(dayRecord)[0].row;
    const fields = countsRowToFields(row);
    // The sheet never knew the tray/singles split, so totals come back as singles.
    expect(fields.smallSingles).toBe('43');
    expect(fields.smallTrays).toBe('');
    expect(fields.sicSingles).toBe('1');
    expect(salesRowToFields(row)).toEqual({
      todayForecast: '7200', currentSales: '4500', tomorrowForecast: '9100',
    });
    expect(salesRowToBible(row)).toBe('regular');
    expect(summaryRowToRounding(row)).toBe('up');
  });

  it('an EON row hydrates back through the EON prefix', () => {
    const row = eonRecordToTabWrites(eonRecord)[0].row;
    expect(countsRowToFields(row, 'EON ').largeSingles).toBe('154');
    expect(eonCountRowToFinalSales(row)).toBe('7900');
  });

  it('unknown bible / rounding cells read as nothing rather than guessing', () => {
    expect(salesRowToBible({})).toBeNull();
    expect(summaryRowToRounding({})).toBeNull();
    expect(salesRowToBible({ Bible: 'peach' })).toBe('peach');
  });

  it('recent fetch → history lines, newest first', () => {
    const history = summaryRowsToHistory({
      '2026-07-28': {
        'Dough Make (estimate)': { Batches: 4 },
        'EON Dough Count': { 'EON Sales': 8200 },
      },
      '2026-07-29': {
        'Dough Make (estimate)': { Batches: 5 },
        'EON Dough Count': null,
      },
      '2026-07-30': null,
    });
    expect(history.map((h) => h.date)).toEqual(['2026-07-29', '2026-07-28']);
    expect(history[0]).toMatchObject({ batchesMade: '5', finalSales: '' });
    expect(history[1]).toMatchObject({ batchesMade: '4', finalSales: '8200' });
  });
});

describe("the night's line on the self-building bible", () => {
  it('records total sales and the whole day’s use — morning plus night', () => {
    const amUse = { sales: 4500, use: { indi: 5, small: 12, large: 9, sic: 1, boli: null } };
    const writes = eonRecordToTabWrites(eonRecord, 'regular', amUse);
    const line = writes.find((w) => w.tab === 'New Bieblerb')!.row;
    expect(line.Date).toBe('2026-01-15');
    expect(line['Total Sales']).toBe(7900);
    // Whatever the morning used plus whatever the night used.
    expect(line.Indi).toBe(5 + (eonRecord.pmUse?.indi ?? 0));
  });

  it('a peach night builds the peach bible instead', () => {
    const writes = eonRecordToTabWrites(eonRecord, 'peach', null);
    expect(writes.map((w) => w.tab)).toContain('New Peach Bieblerb');
    expect(writes.map((w) => w.tab)).not.toContain('New Bieblerb');
  });

  it('a night with no final sales adds nothing to the history', () => {
    const noSales = { ...eonRecord, finalSales: null };
    expect(eonRecordToTabWrites(noSales, 'regular', null).map((w) => w.tab))
      .not.toContain('New Bieblerb');
  });
});

describe('nights whose numbers do not line up', () => {
  it('leaves PM takings blank rather than recording a negative', () => {
    const odd = { ...eonRecord, pmSales: -2400 };
    const row = eonRecordToTabWrites(odd, 'regular')!.find((w) => w.tab === 'PM Dough Use')!.row;
    expect(row['PM Sales $']).toBe('');
  });

  it('a night with no takings teaches the bible nothing', () => {
    const zero = { ...eonRecord, finalSales: 0 };
    expect(eonRecordToTabWrites(zero, 'regular').map((w) => w.tab)).not.toContain('New Bieblerb');
  });
});
