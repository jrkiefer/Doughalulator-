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
  summaryRowToForecastRounding,
  summaryRowToRounding,
  tempsLogRows,
  tempsOverviewRows,
  tempsStationWrites,
  tempsToPayload,
} from './mapping';

/**
 * The worked example: Jan 15, regular bible, owner tapped the batch pill UP.
 * The tap goes in as an INPUT — a record whose stamp and resolved direction
 * disagree could never come out of the engine, and the sheet columns are
 * written from the stamp.
 */
const pmInputs = {
  date: '2026-01-15',
  counts: counts({
    indiTrays: 1, indiSingles: 4, smallTrays: 5, smallSingles: 3,
    largeTrays: 4, largeSingles: 2, sicSingles: 1, boliTrays: 2, boliSingles: 1,
  }),
  todayForecastRaw: 7.2,
  currentSalesRaw: 4.5,
  tomorrowForecastRaw: 9.1,
  batchRound: 'up' as const,
};
const dayRecord = runDoughCalculation(pmInputs, bibles, defaultConfig);

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
    // Every derived tab travels on EVERY save — with blanks where a figure is
    // unknowable — so a figure retracted on screen is retracted on the sheet.
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
      'Forecast Rounding': '', // untapped → blank, so the rule stays live on reload
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
    const row = dayRecordToTabWrites(partial)[0]!.row;
    expect(row['Small Count']).toBe(40);
    expect(row['Sic Count']).toBe(0); // a typed zero is a real zero
    expect(row['Indi Count']).toBe(''); // never counted → blank
  });

  it('a night with no batch direction RETRACTS the make: all-blank rows travel', () => {
    // Blank cells clear their sheet cells, so a make saved earlier tonight
    // and since un-decided cannot linger on the sheet — where the
    // self-building bible would read the stale after-gang figure as truth.
    // (The script skips an all-blank row for a date that has none, so this
    // never appends date-only clutter.)
    const writes = dayRecordToTabWrites({ ...dayRecord, chosenBatchOption: null });
    const blanksOnly = (tab: string) => {
      const row = writes.find((w) => w.tab === tab)!.row;
      const values = Object.entries(row).filter(([k]) => k !== 'Date').map(([, v]) => v);
      expect(values.every((v) => v === '')).toBe(true);
    };
    blanksOnly('Final Make Amount');
    blanksOnly('Estimated Dough After Gang');
    const make = writes.find((w) => w.tab === 'Dough Make (estimate)')!.row;
    expect(make.Batches).toBe(''); // trays are known; the batch count is not
    expect(make['Trays Total']).toBe(dayRecord.totalTrays);
  });

});

describe('eonRecordToTabWrites — the close', () => {
  it('writes the final count and nothing else — the use tabs and the Bieblerb pages are the Dough Log’s', () => {
    const writes = eonRecordToTabWrites(eonRecord);
    expect(writes.map((w) => w.tab)).toEqual(['EON Dough Count']);
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

describe('what the app leaves to the Dough Log', () => {
  it('never writes a use tab or a Bieblerb page — the script derives those from the counts', () => {
    const theirs = ['AM Dough Use', 'PM Dough Use', 'All Day Dough Use', 'New Bieblerb', 'New Peach Bieblerb'];
    const tabs = [...dayRecordToTabWrites(dayRecord), ...eonRecordToTabWrites(eonRecord)].map((w) => w.tab);
    for (const tab of theirs) expect(tabs).not.toContain(tab);
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
    tampered.regular.rows[0]!.small = 53;
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
    const row = dayRecordToTabWrites(dayRecord)[0]!.row;
    const fields = countsRowToFields(row);
    // The sheet never knew the tray/singles split, so totals come back as singles.
    expect(fields.smallSingles).toBe('43');
    expect(fields.smallTrays).toBe('');
    expect(fields.sicSingles).toBe('1');
    expect(salesRowToFields(row)).toEqual({
      todayForecast: '7200', currentSales: '4500', tomorrowForecast: '9100',
    });
    expect(salesRowToBible(row)).toBe('regular');
    // Nothing was tapped on this record, so the sheet records "auto" (blank)
    // and it reads back as auto — the rules stay live on the next load.
    // The batch pill was tapped, so it round-trips; the forecast was left on
    // auto, so it records blank and reads back as auto — the rule stays live.
    expect(summaryRowToRounding(row)).toBe('up');
    expect(summaryRowToForecastRounding(row)).toBeNull();
  });

  it('a TAPPED rounding round-trips through the sheet as itself', () => {
    const stamped = runDoughCalculation(
      { ...pmInputs, forecastRound: 'up', batchRound: 'down' },
      bibles,
      defaultConfig,
    );
    const row = dayRecordToTabWrites(stamped)[0]!.row;
    expect(row['Forecast Rounding']).toBe('up');
    expect(row['Batch Rounding']).toBe('down');
    expect(summaryRowToForecastRounding(row)).toBe('up');
    expect(summaryRowToRounding(row)).toBe('down');
  });

  it('an EON row hydrates back through the EON prefix', () => {
    const row = eonRecordToTabWrites(eonRecord)[0]!.row;
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


