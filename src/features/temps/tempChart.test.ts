import { describe, expect, it } from 'vitest';
import {
  fmtTemp,
  normalizeSlot,
  overLimitReadings,
  SCALE_MAX,
  slotRank,
  stationSeries,
  timeColumns,
} from './tempChart';
import type { RecentTemps, TempReading } from '../../services/tempsService';

const r = (date: string, slot: string, temp: number): TempReading => ({
  date,
  slot,
  time: '12:00',
  temp,
});

describe('timeColumns', () => {
  it('keeps the last three moments across stations, oldest first', () => {
    const stations: RecentTemps = {
      'Pizza 1': [r('2026-08-19', 'Night', 37), r('2026-08-20', 'Morning', 36), r('2026-08-20', '2 PM', 38)],
      'Walk-In': [r('2026-08-19', '2 PM', 39), r('2026-08-20', 'Morning', 39), r('2026-08-20', '2 PM', 40)],
    };
    expect(timeColumns(stations)).toEqual([
      { date: '2026-08-19', slot: 'Night' },
      { date: '2026-08-20', slot: 'Morning' },
      { date: '2026-08-20', slot: '2 PM' },
    ]);
  });

  it('orders slots within a day as Morning, 2 PM, Night — not alphabetically', () => {
    const stations: RecentTemps = {
      Salad: [r('2026-08-20', '2 PM', 34), r('2026-08-20', 'Night', 35)],
      Slice: [r('2026-08-20', 'Morning', 39)],
    };
    expect(timeColumns(stations).map((c) => c.slot)).toEqual(['Morning', '2 PM', 'Night']);
  });

  it('a moment read by two stations is one column, and dates outrank slots', () => {
    const stations: RecentTemps = {
      A: [r('2026-08-19', 'Night', 37), r('2026-08-20', 'Morning', 36)],
      B: [r('2026-08-20', 'Morning', 39)],
    };
    expect(timeColumns(stations)).toEqual([
      { date: '2026-08-19', slot: 'Night' },
      { date: '2026-08-20', slot: 'Morning' },
    ]);
  });

  it('returns fewer columns when fewer moments exist, and none for no data', () => {
    expect(timeColumns({ A: [r('2026-08-20', '2 PM', 34)] })).toHaveLength(1);
    expect(timeColumns({})).toEqual([]);
  });
});

describe('stationSeries', () => {
  const columns = [
    { date: '2026-08-19', slot: 'Night' },
    { date: '2026-08-20', slot: 'Morning' },
    { date: '2026-08-20', slot: '2 PM' },
  ];

  it('aligns readings onto the columns, null where the station was not read', () => {
    const readings = [r('2026-08-19', 'Night', 37), r('2026-08-20', '2 PM', 38)];
    expect(stationSeries(readings, columns)).toEqual([37, null, 38]);
  });

  it('a re-entered slot takes the later entry — a correction, not a duplicate', () => {
    const readings = [r('2026-08-20', '2 PM', 52), r('2026-08-20', '2 PM', 38)];
    expect(stationSeries(readings, columns)).toEqual([null, null, 38]);
  });

  it('a station with nothing in the window is all nulls', () => {
    expect(stationSeries([], columns)).toEqual([null, null, null]);
  });
});

describe('the real Log hands back "2:00 PM", not "2 PM"', () => {
  // Google parses the written text "2 PM" as a time; the display-value read
  // then returns "2:00 PM". The chart must order, match and label it as 2 PM.
  it('normalizeSlot strips the parsed-time formatting, leaves the others alone', () => {
    expect(normalizeSlot('2:00 PM')).toBe('2 PM');
    expect(normalizeSlot('2 PM')).toBe('2 PM');
    expect(normalizeSlot('Morning')).toBe('Morning');
    expect(normalizeSlot('Night')).toBe('Night');
  });

  it('orders and labels a "2:00 PM" column between Morning and Night', () => {
    const stations: RecentTemps = {
      A: [r('2026-08-20', '2:00 PM', 38), r('2026-08-20', 'Night', 37)],
      B: [r('2026-08-20', 'Morning', 36)],
    };
    expect(timeColumns(stations)).toEqual([
      { date: '2026-08-20', slot: 'Morning' },
      { date: '2026-08-20', slot: '2 PM' },
      { date: '2026-08-20', slot: 'Night' },
    ]);
  });

  it('matches a "2:00 PM" reading onto its column', () => {
    const columns = [{ date: '2026-08-20', slot: '2 PM' }];
    expect(stationSeries([r('2026-08-20', '2:00 PM', 38)], columns)).toEqual([38]);
  });
});

describe('slotRank', () => {
  it('puts the three slots in day order', () => {
    expect(slotRank('Morning')).toBeLessThan(slotRank('2 PM'));
    expect(slotRank('2 PM')).toBeLessThan(slotRank('Night'));
  });
});

describe('overLimitReadings — the warning box never misses a hot reading', () => {
  it('collects every reading above the scale top, with a normalized slot', () => {
    const stations: RecentTemps = {
      'Pizza 1': [r('2026-08-20', '2:00 PM', 38), r('2026-08-20', 'Night', 66)],
      Slice: [r('2026-08-19', '2:00 PM', 63)],
      Freezer: [r('2026-08-20', 'Night', 32)],
    };
    expect(overLimitReadings(stations)).toEqual([
      { station: 'Pizza 1', temp: 66, slot: 'Night', date: '2026-08-20' },
      { station: 'Slice', temp: 63, slot: '2 PM', date: '2026-08-19' },
    ]);
  });

  it('exactly the scale top is not over it, and no data raises nothing', () => {
    expect(overLimitReadings({ A: [r('2026-08-20', 'Night', SCALE_MAX)] })).toEqual([]);
    expect(overLimitReadings({})).toEqual([]);
  });
});

describe('fmtTemp', () => {
  it('whole degrees stay whole, halves keep one decimal, minus is typographic', () => {
    expect(fmtTemp(34)).toBe('34°');
    expect(fmtTemp(37.5)).toBe('37.5°');
    expect(fmtTemp(-4)).toBe('−4°');
  });
});
