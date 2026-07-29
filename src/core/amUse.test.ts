import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { computeAmUse } from './amUse';
import { runEonCalculation } from './eon';
import { bibles, counts } from './testHelpers';

describe('computeAmUse', () => {
  // Yesterday's end-of-night count: 34 / 156 / 154 / 2 / 36.
  const yesterdayEon = runEonCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiTrays: 3,
        indiSingles: 1,
        smallTrays: 19,
        smallSingles: 4,
        largeTrays: 25,
        largeSingles: 4,
        sicSingles: 2,
        boilTrays: 6,
      }),
      finalSalesRaw: 12.4,
    },
    null,
    bibles,
    defaultConfig,
  );

  it("morning use = yesterday's end-of-night dough minus this morning's count, all five sizes", () => {
    const result = computeAmUse(
      yesterdayEon,
      { indi: 30, small: 140, large: 160, sic: 1, boil: 30 },
      2200,
    );
    expect(result).toEqual({
      amSales: 2200,
      // Large is negative on purpose: more dough this morning than last night
      // means a miscount — it passes through as-is.
      amUse: { indi: 4, small: 16, large: -6, sic: 1, boil: 6 },
    });
  });

  it("returns null when yesterday has no EON record (closed days stay blank)", () => {
    expect(
      computeAmUse(null, { indi: 30, small: 140, large: 160, sic: 1, boil: 30 }, 2200),
    ).toBeNull();
  });
});
