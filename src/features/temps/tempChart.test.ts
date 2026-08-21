import { describe, expect, it } from 'vitest';
import { fmtTemp, slotRank, stationSeries, timeColumns } from './tempChart';
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

describe('slotRank', () => {
  it('puts the three slots in day order', () => {
    expect(slotRank('Morning')).toBeLessThan(slotRank('2 PM'));
    expect(slotRank('2 PM')).toBeLessThan(slotRank('Night'));
  });
});

describe('fmtTemp', () => {
  it('whole degrees stay whole, halves keep one decimal, minus is typographic', () => {
    expect(fmtTemp(34)).toBe('34°');
    expect(fmtTemp(37.5)).toBe('37.5°');
    expect(fmtTemp(-4)).toBe('−4°');
  });
});
