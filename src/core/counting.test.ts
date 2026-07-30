import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { computeCountedSizes, computeHave } from './counting';
import { counts } from './testHelpers';

describe('computeHave (trays × balls-per-tray + singles, blank ≠ zero)', () => {
  it('computes every size from trays and singles when everything is entered', () => {
    const have = computeHave(
      counts({
        indiTrays: 1, indiSingles: 4,
        smallTrays: 5, smallSingles: 3,
        largeTrays: 4, largeSingles: 2,
        sicSingles: 1,
        boliTrays: 2, boliSingles: 1,
      }),
      defaultConfig,
    );
    expect(have).toEqual({ indi: 15, small: 43, large: 26, sic: 1, boli: 13 });
  });

  it('a fully blank size is null — not a fabricated zero', () => {
    const have = computeHave(counts({ smallTrays: 2 }), defaultConfig);
    expect(have.small).toBe(16);
    expect(have.indi).toBeNull();
    expect(have.large).toBeNull();
    expect(have.sic).toBeNull();
    expect(have.boli).toBeNull();
  });

  it('a typed 0 is a real zero', () => {
    const have = computeHave(counts({ sicSingles: 0, boliTrays: 0 }), defaultConfig);
    expect(have.sic).toBe(0);
    expect(have.boli).toBe(0);
  });

  it('within a counted size, a blank sibling field counts as 0', () => {
    const have = computeHave(counts({ largeTrays: 3 }), defaultConfig);
    expect(have.large).toBe(18); // singles blank → 0
    const have2 = computeHave(counts({ boliSingles: 5 }), defaultConfig);
    expect(have2.boli).toBe(5); // trays blank → 0
  });

  it('Sicilian is singles only', () => {
    expect(computeHave(counts({ sicSingles: 7 }), defaultConfig).sic).toBe(7);
  });
});

describe('computeCountedSizes', () => {
  it('marks a size counted when any of its fields was entered — even a 0', () => {
    const counted = computeCountedSizes(counts({ indiSingles: 0, boliTrays: 3 }));
    expect(counted).toEqual({ indi: true, small: false, large: false, sic: false, boli: true });
  });
});
