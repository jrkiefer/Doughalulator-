import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { buildBatchOption, runDoughCalculation, splitTrayDelta } from './dough';
import { bibles, counts } from './testHelpers';

describe('tonight lookup special cases', () => {
  it('salesLeft exactly 0 → use 0 for every size, no bible row, no flag', () => {
    const record = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ smallTrays: 5, largeTrays: 4 }),
        todayForecastRaw: 5.2,
        currentSalesRaw: 5.2,
        tomorrowForecastRaw: 5.2,
      },
      bibles,
      defaultConfig,
    );
    expect(record.salesLeft).toBe(0);
    expect(record.use).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.tonightRowMatched).toBeNull();
    expect(record.flags.negativeSalesLeft).toBe(false);
  });

  it('negative salesLeft → use 0 for every size AND the negativeSalesLeft flag', () => {
    const record = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts(),
        todayForecastRaw: 5.2,
        currentSalesRaw: 5.5, // already sold past the forecast
        tomorrowForecastRaw: 5.2,
      },
      bibles,
      defaultConfig,
    );
    expect(record.salesLeft).toBe(-300);
    expect(record.use).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.tonightRowMatched).toBeNull();
    expect(record.flags.negativeSalesLeft).toBe(true);
  });
});

describe('shortage and make clamps', () => {
  it('left clamps at 0 downstream but keeps the raw negative as a shortage warning', () => {
    const record = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ indiTrays: 2, smallTrays: 1, largeTrays: 10, sicSingles: 3 }),
        todayForecastRaw: 4.0, // salesLeft 4,000 → exact row: use 12/58/50/2
        currentSalesRaw: 0,
        tomorrowForecastRaw: 4.0,
      },
      bibles,
      defaultConfig,
    );
    // have: indi 22, small 8, large 60, sic 3 — small is 50 short.
    expect(record.leftRaw).toEqual({ indi: 10, small: -50, large: 10, sic: 1 });
    expect(record.left).toEqual({ indi: 10, small: 0, large: 10, sic: 1 });
    expect(record.flags.shortageSizes).toEqual(['small']);
  });

  it('make clamps at 0 when tonight leaves more than tomorrow needs', () => {
    const record = runDoughCalculation(
      {
        date: '2026-01-15',
        counts: counts({ indiTrays: 4, smallTrays: 30, largeTrays: 30, sicSingles: 8, boilTrays: 6 }),
        todayForecastRaw: 5.2,
        currentSalesRaw: 5.2, // salesLeft 0 → use 0 → left = have
        tomorrowForecastRaw: 3.75, // lowest row: need 11/52/44/2 — all covered
      },
      bibles,
      defaultConfig,
    );
    expect(record.make).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.trays).toEqual({ indi: 0, small: 0, large: 0, sic: 0 });
    expect(record.boilTrays).toBe(0);
    expect(record.totalTrays).toBe(0);
    expect(record.exactBatches).toBe(0);
  });
});

describe('Boil (never in the bible — top back up to 6 trays)', () => {
  const base = {
    date: '2026-01-15',
    todayForecastRaw: 5.2,
    currentSalesRaw: 5.2,
    tomorrowForecastRaw: 3.75,
  };

  it('2 trays counted → make 4', () => {
    const record = runDoughCalculation(
      { ...base, counts: counts({ boilTrays: 2 }) },
      bibles,
      defaultConfig,
    );
    expect(record.boilTrays).toBe(4);
  });

  it('6 or more trays counted → make 0 (never negative)', () => {
    const atTarget = runDoughCalculation(
      { ...base, counts: counts({ boilTrays: 6 }) },
      bibles,
      defaultConfig,
    );
    const overTarget = runDoughCalculation(
      { ...base, counts: counts({ boilTrays: 7 }) },
      bibles,
      defaultConfig,
    );
    expect(atTarget.boilTrays).toBe(0);
    expect(overTarget.boilTrays).toBe(0);
  });
});

describe('splitTrayDelta (40/60 between Small and Large)', () => {
  it('splits a positive delta', () => {
    expect(splitTrayDelta(1, defaultConfig)).toEqual({ smallTrayDelta: 0, largeTrayDelta: 1 });
    expect(splitTrayDelta(3, defaultConfig)).toEqual({ smallTrayDelta: 1, largeTrayDelta: 2 });
    expect(splitTrayDelta(10, defaultConfig)).toEqual({ smallTrayDelta: 4, largeTrayDelta: 6 });
  });

  it('splits a negative (round-down) delta', () => {
    expect(splitTrayDelta(-10, defaultConfig)).toEqual({ smallTrayDelta: -4, largeTrayDelta: -6 });
    expect(splitTrayDelta(-7, defaultConfig)).toEqual({ smallTrayDelta: -3, largeTrayDelta: -4 });
  });
});

describe('buildBatchOption', () => {
  const parts = {
    totalTrays: 9,
    trays: { indi: 0, small: 2, large: 3, sic: 0 },
    sicBalls: 0,
    boilTrays: 4,
    counts: counts({ smallTrays: 1, largeTrays: 1, boilTrays: 2 }),
    have: { indi: 0, small: 8, large: 6, sic: 0, boil: 12 },
  };

  it('never adjusts Small or Large below 0 trays', () => {
    // Round down to 0 batches: delta −9 → smallΔ −4, largeΔ −5 → both would go negative.
    const option = buildBatchOption(0, parts, defaultConfig);
    expect(option.trayDelta).toBe(-9);
    expect(option.finalTraysToMake.small).toBe(0);
    expect(option.finalTraysToMake.large).toBe(0);
  });

  it('when totalTrays is already divisible by 11, both options are the same and nothing shifts', () => {
    const evenParts = {
      totalTrays: 22,
      trays: { indi: 2, small: 8, large: 6, sic: 2 },
      sicBalls: 5,
      boilTrays: 4,
      counts: counts(),
      have: { indi: 0, small: 0, large: 0, sic: 0, boil: 0 },
    };
    const exactBatches = 22 / 11; // 2 exactly
    const down = buildBatchOption(Math.floor(exactBatches), evenParts, defaultConfig);
    const up = buildBatchOption(Math.ceil(exactBatches), evenParts, defaultConfig);
    expect(down).toEqual(up);
    expect(down.trayDelta).toBe(0);
    expect(down.finalTraysToMake).toEqual({ indi: 2, small: 8, large: 6, sic: 2, boil: 4 });
  });
});
