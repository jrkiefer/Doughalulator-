import { describe, expect, it } from 'vitest';
import { defaultConfig, type AppConfig } from '../config';
import { lookupBibleRow, rowToNeeds, selectBibleId } from './bible';
import { peachBible, regularBible } from './testHelpers';

describe('selectBibleId (which bible applies by date)', () => {
  it('uses the regular bible through June 30', () => {
    expect(selectBibleId('2026-06-30', defaultConfig)).toBe('regular');
  });

  it('switches to peach on July 1', () => {
    expect(selectBibleId('2026-07-01', defaultConfig)).toBe('peach');
  });

  it('stays peach through August 31', () => {
    expect(selectBibleId('2026-08-31', defaultConfig)).toBe('peach');
  });

  it('back to regular on September 1', () => {
    expect(selectBibleId('2026-09-01', defaultConfig)).toBe('regular');
  });

  it('honors an explicit override in both directions', () => {
    expect(selectBibleId('2026-07-15', defaultConfig, 'regular')).toBe('regular');
    expect(selectBibleId('2026-01-15', defaultConfig, 'peach')).toBe('peach');
  });
});

describe('lookupBibleRow', () => {
  it('returns an exact row when sales match exactly', () => {
    const row = lookupBibleRow(regularBible, 9100, defaultConfig);
    expect(row).toMatchObject({ sales: 9100, indi: 26, small: 125, large: 117, sic: 3 });
  });

  it('exact match wins even at the rounding threshold (10,000)', () => {
    expect(lookupBibleRow(regularBible, 10000, defaultConfig).sales).toBe(10000);
  });

  it('rounds DOWN between rows below 10,000 (9,500 → the 9,100 row)', () => {
    expect(lookupBibleRow(regularBible, 9500, defaultConfig).sales).toBe(9100);
  });

  it('rounds UP between rows at/above 10,000 (10,300 → the 10,700 row)', () => {
    expect(lookupBibleRow(regularBible, 10300, defaultConfig).sales).toBe(10700);
  });

  it('same rule in the peach bible (8,200 → 8,000; 12,200 → 12,500)', () => {
    expect(lookupBibleRow(peachBible, 8200, defaultConfig).sales).toBe(8000);
    expect(lookupBibleRow(peachBible, 12200, defaultConfig).sales).toBe(12500);
  });

  it('clamps below the lowest row (regular 2,000 → 3,750; peach 1,000 → 3,000)', () => {
    expect(lookupBibleRow(regularBible, 2000, defaultConfig).sales).toBe(3750);
    expect(lookupBibleRow(peachBible, 1000, defaultConfig).sales).toBe(3000);
  });

  it('clamps above the highest row (regular 25,000 → 20,750; peach 20,000 → 17,500)', () => {
    expect(lookupBibleRow(regularBible, 25000, defaultConfig).sales).toBe(20750);
    expect(lookupBibleRow(peachBible, 20000, defaultConfig).sales).toBe(17500);
  });

  it('the rounding strategy is config-driven, not hard-coded', () => {
    const flipped: AppConfig = {
      ...defaultConfig,
      bibleRounding: { threshold: 10000, below: 'up', atOrAbove: 'down' },
    };
    expect(lookupBibleRow(regularBible, 9500, flipped).sales).toBe(10000);
    expect(lookupBibleRow(regularBible, 10300, flipped).sales).toBe(10000);
  });
});

describe('rowToNeeds', () => {
  it("ignores the peach rows' reference trays/batches columns", () => {
    const row = lookupBibleRow(peachBible, 9500, defaultConfig);
    expect(row.trays).toBe(47); // present in the data…
    expect(rowToNeeds(row)).toEqual({ indi: 29, small: 179, large: 133, sic: 4 }); // …absent from needs
  });
});
