import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { computeHave } from './counting';
import { counts } from './testHelpers';

describe('computeHave (trays × balls-per-tray + singles)', () => {
  it('computes every size from trays and singles', () => {
    const have = computeHave(
      counts({
        indiTrays: 1,
        indiSingles: 4,
        smallTrays: 5,
        smallSingles: 3,
        largeTrays: 4,
        largeSingles: 2,
        sicSingles: 1,
        boilTrays: 2,
        boilSingles: 1,
      }),
      defaultConfig,
    );
    expect(have).toEqual({
      indi: 1 * 11 + 4, // 15
      small: 5 * 8 + 3, // 43
      large: 4 * 6 + 2, // 26
      sic: 1,
      boil: 2 * 6 + 1, // 13
    });
  });

  it('Sicilian is singles only — there is no tray field for it at all', () => {
    const have = computeHave(counts({ sicSingles: 7 }), defaultConfig);
    expect(have.sic).toBe(7);
  });
});
