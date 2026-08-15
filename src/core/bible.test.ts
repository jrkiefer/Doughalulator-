import { describe, expect, it } from 'vitest';
import { defaultConfig, type AppConfig } from '../config';
import { isSlowDay, lookupBibleRow, resolveForecastRound, rowToNeeds, selectBibleId } from './bible';
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

describe('lookupBibleRow — up by default, down only when asked', () => {
  it('returns an exact row when sales match exactly, either direction', () => {
    expect(lookupBibleRow(regularBible, 9100, defaultConfig)).toMatchObject({
      sales: 9100, indi: 26, small: 125, large: 117, sic: 3,
    });
    expect(lookupBibleRow(regularBible, 9100, defaultConfig, 'down').sales).toBe(9100);
  });

  it('rounds UP between rows by default (9,500 → the 10,000 row)', () => {
    expect(lookupBibleRow(regularBible, 9500, defaultConfig).sales).toBe(10000);
    expect(lookupBibleRow(regularBible, 10300, defaultConfig).sales).toBe(10700);
  });

  it('rounds DOWN when asked, within the $400 cap (9,500 → the 9,100 row)', () => {
    expect(lookupBibleRow(regularBible, 9500, defaultConfig, 'down').sales).toBe(9100);
  });

  it('a drop wider than $400 falls back to up, even asked to round down', () => {
    // 9,600 is $500 above the 9,100 row — too far to shed in one lookup.
    expect(lookupBibleRow(regularBible, 9600, defaultConfig, 'down').sales).toBe(10000);
    // …while exactly $400 is still inside the cap.
    expect(lookupBibleRow(regularBible, 9500, defaultConfig, 'down').sales).toBe(9100);
  });

  it('the same rules in the peach bible', () => {
    expect(lookupBibleRow(peachBible, 8200, defaultConfig).sales).toBe(8500);
    expect(lookupBibleRow(peachBible, 8200, defaultConfig, 'down').sales).toBe(8000);
    // 8,450 is $450 past the 8,000 row — over the cap, so up.
    expect(lookupBibleRow(peachBible, 8450, defaultConfig, 'down').sales).toBe(8500);
  });

  it('clamps below the lowest row (regular 2,000 → 3,750; peach 1,000 → 3,000)', () => {
    expect(lookupBibleRow(regularBible, 2000, defaultConfig).sales).toBe(3750);
    expect(lookupBibleRow(regularBible, 2000, defaultConfig, 'down').sales).toBe(3750);
    expect(lookupBibleRow(peachBible, 1000, defaultConfig).sales).toBe(3000);
  });

  it('clamps above the highest row (regular 25,000 → 20,750; peach 20,000 → 17,500)', () => {
    expect(lookupBibleRow(regularBible, 25000, defaultConfig).sales).toBe(20750);
    expect(lookupBibleRow(peachBible, 20000, defaultConfig).sales).toBe(17500);
  });

  it('the cap is config-driven, not hard-coded', () => {
    const generous: AppConfig = {
      ...defaultConfig,
      bibleRounding: { ...defaultConfig.bibleRounding, maxRoundDownGap: 900 },
    };
    // The same 9,600 that fell back to up above now clears a $900 cap.
    expect(lookupBibleRow(regularBible, 9600, generous, 'down').sales).toBe(9100);
  });
});

describe('isSlowDay + resolveForecastRound', () => {
  it('a slow day is BOTH forecasts entered and both under $13,000', () => {
    expect(isSlowDay(12000, 12999, defaultConfig)).toBe(true);
    expect(isSlowDay(13000, 12000, defaultConfig)).toBe(false); // exactly the gate fails
    expect(isSlowDay(12000, 13500, defaultConfig)).toBe(false);
    expect(isSlowDay(null, 12000, defaultConfig)).toBe(false); // one missing is not slow
    expect(isSlowDay(12000, null, defaultConfig)).toBe(false);
  });

  it('rounds down on a slow day and up on every other night', () => {
    expect(resolveForecastRound(null, 9000, 8000, defaultConfig)).toBe('down');
    expect(resolveForecastRound(null, 18000, 16000, defaultConfig)).toBe('up');
    expect(resolveForecastRound(null, null, null, defaultConfig)).toBe('up');
  });

  it('a tapped pill wins over the rule, both ways', () => {
    expect(resolveForecastRound('up', 9000, 8000, defaultConfig)).toBe('up');
    expect(resolveForecastRound('down', 18000, 16000, defaultConfig)).toBe('down');
  });
});

describe('rowToNeeds', () => {
  it("ignores the peach rows' reference trays/batches columns", () => {
    const row = lookupBibleRow(peachBible, 9500, defaultConfig, 'down');
    expect(row.sales).toBe(9500);
    expect(row.trays).toBe(47); // present in the data…
    expect(rowToNeeds(row)).toEqual({ indi: 29, small: 179, large: 133, sic: 4 }); // …absent from needs
  });
});
