import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation, runEonCalculation } from '../core';
import { bibles, counts } from '../core/testHelpers';
import {
  biblesToPayload,
  countsRowToFields,
  dayRecordToTabWrites,
  eonCountRowToFinalSales,
  eonCountRowToHave,
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
  type TabWrite,
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

function tabOf(writes: TabWrite[], name: string) {
  const found = writes.filter((w) => w.tab === name);
  expect(found).toHaveLength(1);
  return found[0].row;
}

describe('dayRecordToTabWrites', () => {
  const writes = dayRecordToTabWrites(dayRecord);

  it('writes the nine 2 PM tabs — and no usage snapshots (the sheet computes those)', () => {
    expect(writes.map((w) => w.tab).sort()).toEqual(
      ['Batches', 'Dough Count', 'Final Dough', 'Left', 'Make',
       'Need Tomorrow', 'Sales', 'Summary', 'Use Tonight'].sort(),
    );
  });

  it('Summary row', () => {
    expect(tabOf(writes, 'Summary')).toEqual({
      Date: '2026-01-15',
      'Bible Used': "Bible '26",
      'Forecast Tonight $': 7200,
      'Current Sales $': 4500,
      'Sales Left $': 2700,
      'Forecast Tomorrow $': 9100,
      'Total Trays To Make': 48,
      'Exact Batches': 4.36,
      'Chosen (Up/Down)': 'Up',
      'Batches Made': 5,
      'Shortage?': 'Small, Large, Sic',
    });
  });

  it('Left row keeps the raw negatives with the shortage text', () => {
    expect(tabOf(writes, 'Left')).toEqual({
      Date: '2026-01-15',
      Indi: 4, Small: -9, Large: -18, Sic: -1,
      Shortages: 'Small -9, Large -18, Sic -1',
    });
  });

  it('Make is pre-adjustment (set-out replaced); Batches sums to batches × 11', () => {
    const make = tabOf(writes, 'Make');
    expect(make).toMatchObject({
      'Small Balls': 134, 'Small Trays': 17, 'Large Balls': 135, 'Large Trays': 23,
      'Sic Balls': 4, 'Boli Trays': 4,
    });
    const batches = tabOf(writes, 'Batches');
    expect(batches).toMatchObject({ Batches: 5, 'Rounded (Up/Down)': 'Up', Small: 20, Large: 27 });
    const sum =
      (batches.Indi as number) + (batches.Small as number) + (batches.Large as number) +
      (batches.Sic as number) + (batches.Boli as number);
    expect(sum).toBe(5 * defaultConfig.traysPerBatch);
  });

  it('Final Dough comes from the chosen (up) option, Boli singles included', () => {
    expect(tabOf(writes, 'Final Dough')).toMatchObject({
      'Small Trays': 25, 'Small Final': 203, 'Large Final': 188, 'Sic Final': 5,
      'Boli Trays': 6, 'Boli Singles': 1, 'Boli Final': 37,
    });
  });

  it('without a tapped choice, the choice-dependent tabs are simply absent (§11.3)', () => {
    const untapped = dayRecordToTabWrites(baseRecord);
    expect(untapped.some((w) => w.tab === 'Batches')).toBe(false);
    expect(untapped.some((w) => w.tab === 'Final Dough')).toBe(false);
    const summary = tabOf(untapped, 'Summary');
    expect(summary['Chosen (Up/Down)']).toBe('');
    expect(summary['Batches Made']).toBe('');
  });

  it('blanks travel as EMPTY CELLS, never fabricated zeros (§2)', () => {
    const partial = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ smallTrays: 5 }), // only Small counted
        todayForecastRaw: 7.2,
        currentSalesRaw: 4.5,
        tomorrowForecastRaw: null, // tomorrow blank
      },
      bibles,
      defaultConfig,
    );
    const writes2 = dayRecordToTabWrites(partial);
    const summary = tabOf(writes2, 'Summary');
    expect(summary['Forecast Tomorrow $']).toBe('');
    expect(summary['Total Trays To Make']).toBe('');
    const count = tabOf(writes2, 'Dough Count');
    expect(count['Indi Trays']).toBe('');
    expect(count['Indi Have']).toBe('');
    expect(count['Small Have']).toBe(40);
    expect(count['Small Singles']).toBe(''); // sibling blank stays blank in the sheet
    const sales = tabOf(writes2, 'Sales');
    expect(sales['Forecast Tomorrow (entered)']).toBe('');
    expect(sales['Bible Row Matched Tomorrow']).toBe('');
    const need = tabOf(writes2, 'Need Tomorrow');
    expect(need.Indi).toBe('');
  });

  it('a typed 0 lands as a real 0 cell, and closed tomorrow labels the matched row', () => {
    const closed = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ sicSingles: 0 }),
        todayForecastRaw: 5.2,
        currentSalesRaw: 2.2,
        tomorrowForecastRaw: 0,
      },
      bibles,
      defaultConfig,
    );
    const writes2 = dayRecordToTabWrites(closed);
    expect(tabOf(writes2, 'Dough Count')['Sic Have']).toBe(0);
    expect(tabOf(writes2, 'Summary')['Forecast Tomorrow $']).toBe(0);
    expect(tabOf(writes2, 'Sales')['Bible Row Matched Tomorrow']).toBe('Closed');
    expect(tabOf(writes2, 'Need Tomorrow')).toMatchObject({ Indi: 0, Small: 0, Large: 0, Sic: 0 });
  });

  it('"0 — flagged" lands in Bible Row Matched Tonight when sales left went negative', () => {
    const negative = runDoughCalculation(
      {
        date: '2026-01-15', counts: counts({ smallTrays: 1 }),
        todayForecastRaw: 5.2, currentSalesRaw: 5.5, tomorrowForecastRaw: 5.2,
      },
      bibles, defaultConfig,
    );
    expect(tabOf(dayRecordToTabWrites(negative), 'Sales')['Bible Row Matched Tonight'])
      .toBe('0 — flagged');
  });
});

describe('eonRecordToTabWrites', () => {
  const writes = eonRecordToTabWrites(eonRecord);

  it('writes only EON tabs (merge semantics), no usage snapshot', () => {
    expect(writes.map((w) => w.tab).sort()).toEqual(['EON Check', 'EON Count']);
  });

  it('EON Count row: trays/singles/have per size plus both final-sales forms', () => {
    expect(tabOf(writes, 'EON Count')).toMatchObject({
      Date: '2026-01-15',
      'Indi Have': 34, 'Small Have': 156, 'Large Have': 154, 'Sic Have': 2, 'Boli Have': 36,
      'Final Sales (entered)': 7.9,
      'Final Sales $': 7900,
    });
  });

  it('EON Check row now includes Boli against its 36-ball target (§11.1)', () => {
    expect(tabOf(writes, 'EON Check')).toEqual({
      Date: '2026-01-15',
      Indi: 8, Small: 31, Large: 37, Sic: -1, Boli: 0,
      'Trays Short': 'Sic 1',
    });
  });

  it('a Boli shortfall joins the Trays Short text', () => {
    const short = runEonCalculation(
      {
        date: '2026-01-15',
        counts: counts({
          indiTrays: 3, indiSingles: 1, smallTrays: 19, smallSingles: 4,
          largeTrays: 25, largeSingles: 4, sicSingles: 2, boliTrays: 4, boliSingles: 3,
        }),
        finalSalesRaw: 7.9,
      },
      dayRecord,
      bibles,
      defaultConfig,
    );
    const row = tabOf(eonRecordToTabWrites(short), 'EON Check');
    expect(row.Boli).toBe(-9);
    expect(row['Trays Short']).toBe('Sic 1, Boli 2');
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
  it('Dough Count row round-trips counts, blanks staying blank (§2)', () => {
    const partial = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ smallTrays: 5, sicSingles: 0 }),
        todayForecastRaw: null,
        currentSalesRaw: null,
        tomorrowForecastRaw: null,
      },
      bibles,
      defaultConfig,
    );
    const row = tabOf(dayRecordToTabWrites(partial), 'Dough Count');
    const fields = countsRowToFields(row);
    expect(fields.smallTrays).toBe('5');
    expect(fields.smallSingles).toBe(''); // blank hydrates back as blank
    expect(fields.indiTrays).toBe('');
    expect(fields.sicSingles).toBe('0'); // explicit zero hydrates back as '0'
  });

  it('Sales row → raw entered strings + the record’s bible', () => {
    const row = tabOf(dayRecordToTabWrites(dayRecord), 'Sales');
    expect(salesRowToFields(row)).toEqual({
      todayForecast: '7.2', currentSales: '4.5', tomorrowForecast: '9.1',
    });
    expect(salesRowToBible(row, defaultConfig)).toBe('regular');
    expect(salesRowToBible({ 'Bible Used': "Peach '24" }, defaultConfig)).toBe('peach');
    expect(salesRowToBible({}, defaultConfig)).toBeNull();
  });

  it('Summary row → the tapped rounding choice', () => {
    expect(summaryRowToRounding({ 'Chosen (Up/Down)': 'Up' })).toBe('up');
    expect(summaryRowToRounding({ 'Chosen (Up/Down)': 'Down' })).toBe('down');
    expect(summaryRowToRounding({})).toBeNull();
  });

  it('EON Count row → eonHave and the entered final sales', () => {
    const row = tabOf(eonRecordToTabWrites(eonRecord), 'EON Count');
    expect(eonCountRowToHave(row)).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boli: 36 });
    expect(eonCountRowToFinalSales(row)).toBe('7.9');
    expect(eonCountRowToHave({})).toBeNull();
  });

  it('recent fetch → history lines, newest first', () => {
    const history = summaryRowsToHistory({
      '2026-07-28': {
        Summary: { 'Batches Made': 4, 'Shortage?': '' },
        'EON Count': { 'Final Sales $': 8200 },
      },
      '2026-07-29': {
        Summary: { 'Batches Made': 5, 'Shortage?': 'Small' },
        'EON Count': null,
      },
      '2026-07-27': null,
    });
    expect(history).toEqual([
      { date: '2026-07-29', finalSales: '', batchesMade: '5', shortage: true },
      { date: '2026-07-28', finalSales: '8200', batchesMade: '4', shortage: false },
    ]);
  });
});
