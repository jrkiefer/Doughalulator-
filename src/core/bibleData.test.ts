import { describe, expect, it } from 'vitest';
import { bibles } from '../data/bibles';
import type { Bible } from './types';

/**
 * Tripwires on the shipped bible data itself.
 *
 * `lookupBibleRow` walks the rows assuming they climb by sales — that is how it
 * finds the pair to round between. Nothing else checks it, so a future edit that
 * reordered a row would hand back the wrong dough for the rest of time with
 * every other test still green. These are the guards for that.
 *
 * They deliberately assert SHAPE, never a particular number: the bibles are the
 * owner's real data and no test should ever be a reason to change one.
 */
const EACH: [string, Bible][] = [
  ['regular', bibles.regular],
  ['peach', bibles.peach],
];

describe.each(EACH)('the %s bible is well-formed', (_name, bible) => {
  it('has rows to look up', () => {
    expect(bible.rows.length).toBeGreaterThan(0);
  });

  it('climbs by sales, with no repeats', () => {
    const sales = bible.rows.map((r) => r.sales);
    const sorted = [...sales].sort((a, b) => a - b);
    expect(sales).toEqual(sorted);
    expect(new Set(sales).size).toBe(sales.length);
  });

  it('gives every size a real number on every row', () => {
    for (const row of bible.rows) {
      for (const size of ['indi', 'small', 'large', 'sic'] as const) {
        expect(Number.isFinite(row[size]), `${row.sales} → ${size}`).toBe(true);
        expect(row[size], `${row.sales} → ${size}`).toBeGreaterThanOrEqual(0);
      }
    }
  });
});
