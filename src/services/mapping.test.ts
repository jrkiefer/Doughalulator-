import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { computeAmUse, runDoughCalculation, runEonCalculation } from '../core';
import { bibles, counts } from '../core/testHelpers';
import {
  biblesToPayload,
  countsRowToFields,
  dayRecordToTabWrites,
  eonCountRowToFinalSales,
  eonCountRowToHave,
  eonRecordToTabWrites,
  hashString,
  salesRowToFields,
  summaryRowToRounding,
  tempsLogRows,
  tempsOverviewRows,
  tempsStationWrites,
  tempsToPayload,
  type TabWrite,
} from './mapping';

/** The phase-1 worked example: Jan 15, regular bible, owner tapped UP. */
const dayRecord = {
  ...runDoughCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 1, indiSingles: 4, smallTrays: 5, smallSingles: 3,
        largeTrays: 4, largeSingles: 2, sicSingles: 1, boilTrays: 2, boilSingles: 1,
      }),
      todayForecastRaw: 7.2,
      currentSalesRaw: 4.5,
      tomorrowForecastRaw: 9.1,
    },
    bibles,
    defaultConfig,
  ),
  chosenBatchOption: 'up' as const,
};

const eonRecord = runEonCalculation(
  {
    date: '2026-01-15',
    counts: counts({
      indiTrays: 3, indiSingles: 1, smallTrays: 19, smallSingles: 4,
      largeTrays: 25, largeSingles: 4, sicSingles: 2, boilTrays: 6,
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
  const amUse = computeAmUse(
    { ...eonRecord, eonHave: { indi: 34, small: 156, large: 154, sic: 2, boil: 36 } },
    { indi: 30, small: 140, large: 160, sic: 1, boil: 30 },
    2200,
  );
  const writes = dayRecordToTabWrites(dayRecord, amUse);

  it('writes exactly the ten 2 PM tabs — never EON tabs (merge semantics)', () => {
    expect(writes.map((w) => w.tab).sort()).toEqual(
      ['Actual Use', 'Batches', 'Dough Count', 'Final Dough', 'Left', 'Make',
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
      'Total Trays To Make': 43,
      'Exact Batches': 3.91,
      'Chosen (Up/Down)': 'Up',
      'Batches Made': 4,
      'Shortage?': 'Small, Large, Sic',
    });
  });

  it('Sales row keeps entered shorthand AND expanded dollars', () => {
    const row = tabOf(writes, 'Sales');
    expect(row['Forecast Tonight (entered)']).toBe(7.2);
    expect(row['Forecast Tonight $']).toBe(7200);
    expect(row['Bible Row Matched Tonight']).toBe(3750);
    expect(row['Bible Row Matched Tomorrow']).toBe(9100);
  });

  it('Left row carries clamped values plus raw negatives as red-flag text', () => {
    expect(tabOf(writes, 'Left')).toEqual({
      Date: '2026-01-15',
      Indi: 4, Small: 0, Large: 0, Sic: 0,
      Shortages: 'Small -9, Large -18, Sic -1',
    });
  });

  it('Make is pre-adjustment; Batches is post-adjustment and sums to batches × 11', () => {
    const make = tabOf(writes, 'Make');
    expect(make['Small Trays']).toBe(16);
    expect(make['Sic Balls']).toBe(3);
    const batches = tabOf(writes, 'Batches');
    expect(batches).toMatchObject({ Batches: 4, 'Rounded (Up/Down)': 'Up', Small: 16, Large: 21 });
    const sum =
      (batches.Indi as number) + (batches.Small as number) + (batches.Large as number) +
      (batches.Sic as number) + (batches.Boil as number);
    expect(sum).toBe(4 * defaultConfig.traysPerBatch);
  });

  it('Final Dough comes from the chosen (up) option', () => {
    expect(tabOf(writes, 'Final Dough')).toMatchObject({
      'Small Trays': 21, 'Small Final': 171, 'Large Final': 152, 'Sic Final': 4, 'Boil Final': 37,
    });
  });

  it('Actual Use gets only its AM half at the 2 PM save', () => {
    expect(tabOf(writes, 'Actual Use')).toEqual({
      Date: '2026-01-15',
      'AM Sales $': 2200,
      'AM Indi': 4, 'AM Small': 16, 'AM Large': -6, 'AM Sic': 1, 'AM Boil': 6,
    });
  });

  it('without yesterday-EON data the Actual Use row is just the date (nothing blanked)', () => {
    const bare = dayRecordToTabWrites(dayRecord, null);
    expect(tabOf(bare, 'Actual Use')).toEqual({ Date: '2026-01-15' });
  });

  it('"0 — flagged" lands in Bible Row Matched Tonight when sales left went negative', () => {
    const negative = {
      ...runDoughCalculation(
        {
          date: '2026-01-15', counts: counts(),
          todayForecastRaw: 5.2, currentSalesRaw: 5.5, tomorrowForecastRaw: 5.2,
        },
        bibles, defaultConfig,
      ),
      chosenBatchOption: 'down' as const,
    };
    expect(tabOf(dayRecordToTabWrites(negative, null), 'Sales')['Bible Row Matched Tonight'])
      .toBe('0 — flagged');

    const zero = {
      ...runDoughCalculation(
        {
          date: '2026-01-15', counts: counts(),
          todayForecastRaw: 5.2, currentSalesRaw: 5.2, tomorrowForecastRaw: 5.2,
        },
        bibles, defaultConfig,
      ),
      chosenBatchOption: 'down' as const,
    };
    expect(tabOf(dayRecordToTabWrites(zero, null), 'Sales')['Bible Row Matched Tonight']).toBe('0');
  });
});

describe('eonRecordToTabWrites', () => {
  const writes = eonRecordToTabWrites(eonRecord);

  it('writes only EON tabs (merge semantics)', () => {
    expect(writes.map((w) => w.tab).sort()).toEqual(['Actual Use', 'EON Check', 'EON Count']);
  });

  it('EON Count row: trays/singles/have per size plus both final-sales forms', () => {
    expect(tabOf(writes, 'EON Count')).toMatchObject({
      Date: '2026-01-15',
      'Indi Have': 34, 'Small Have': 156, 'Large Have': 154, 'Sic Have': 2, 'Boil Have': 36,
      'Final Sales (entered)': 7.9,
      'Final Sales $': 7900,
    });
  });

  it('EON Check row: per-size left with Trays Short text, Boil absent', () => {
    const row = tabOf(writes, 'EON Check');
    expect(row).toEqual({
      Date: '2026-01-15', Indi: 8, Small: 31, Large: 37, Sic: -1, 'Trays Short': 'Sic 1',
    });
    expect(row).not.toHaveProperty('Boil');
  });

  it('Actual Use gets only its PM half at the EON save', () => {
    expect(tabOf(writes, 'Actual Use')).toEqual({
      Date: '2026-01-15',
      'PM Sales $': 3400,
      'PM Indi': 3, 'PM Small': 15, 'PM Large': -2, 'PM Sic': 2, 'PM Boil': 1,
    });
  });

  it('two-step fill: merging the AM half and the PM half completes one row', () => {
    const amHalf = tabOf(
      dayRecordToTabWrites(
        dayRecord,
        { amSales: 2200, amUse: { indi: 4, small: 16, large: -6, sic: 1, boil: 6 } },
      ),
      'Actual Use',
    );
    const pmHalf = tabOf(writes, 'Actual Use');
    const merged = { ...amHalf, ...pmHalf }; // what the sheet row holds after both saves
    expect(Object.keys(merged).sort()).toEqual(
      ['AM Boil', 'AM Indi', 'AM Large', 'AM Sales $', 'AM Sic', 'AM Small',
       'Date', 'PM Boil', 'PM Indi', 'PM Large', 'PM Sales $', 'PM Sic', 'PM Small'].sort(),
    );
    expect(merged['AM Sales $']).toBe(2200);
    expect(merged['PM Sales $']).toBe(3400);
  });
});

describe('bible mirror payload + hash gate', () => {
  it('is deterministic and carries the full tables', () => {
    const a = biblesToPayload(bibles);
    const b = biblesToPayload(bibles);
    expect(a.hash).toBe(b.hash);
    expect(a.bibles.dough.rows).toHaveLength(27);
    expect(a.bibles.peach.rows).toHaveLength(30);
    expect(a.bibles.dough.rows[0]).toEqual([3750, 11, 52, 44, 2]);
  });

  it('the hash changes when any number changes', () => {
    const tampered = structuredClone(bibles);
    tampered.regular.rows[0].small = 53;
    expect(biblesToPayload(tampered).hash).not.toBe(biblesToPayload(bibles).hash);
  });

  it('hashString is stable for known input', () => {
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

describe('reverse mapping (LOAD FROM SHEET)', () => {
  it('Dough Count row → the nine count-field strings (Sic Have becomes its singles)', () => {
    const row = tabOf(dayRecordToTabWrites(dayRecord, null), 'Dough Count');
    expect(countsRowToFields(row)).toEqual({
      indiTrays: '1', indiSingles: '4', smallTrays: '5', smallSingles: '3',
      largeTrays: '4', largeSingles: '2', sicSingles: '1', boilTrays: '2', boilSingles: '1',
    });
  });

  it('Sales row → the raw entered strings', () => {
    const row = tabOf(dayRecordToTabWrites(dayRecord, null), 'Sales');
    expect(salesRowToFields(row)).toEqual({
      todayForecast: '7.2', currentSales: '4.5', tomorrowForecast: '9.1',
    });
  });

  it('Summary row → the tapped rounding choice', () => {
    expect(summaryRowToRounding({ 'Chosen (Up/Down)': 'Up' })).toBe('up');
    expect(summaryRowToRounding({ 'Chosen (Up/Down)': 'Down' })).toBe('down');
    expect(summaryRowToRounding({})).toBeNull();
  });

  it('EON Count row → eonHave and the entered final sales', () => {
    const row = tabOf(eonRecordToTabWrites(eonRecord), 'EON Count');
    expect(eonCountRowToHave(row)).toEqual({ indi: 34, small: 156, large: 154, sic: 2, boil: 36 });
    expect(eonCountRowToFinalSales(row)).toBe('7.9');
    expect(eonCountRowToHave({})).toBeNull();
  });
});
