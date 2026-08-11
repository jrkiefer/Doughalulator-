import type { CountedInventory } from './types';

export { bibles, peachBible, regularBible } from '../data/bibles';

/**
 * Build an inventory count from just the entered parts. Anything not listed
 * is null — "left blank" — matching how the form parses untouched fields.
 */
export function counts(
  partial: Partial<Record<keyof CountedInventory, number>> = {},
): CountedInventory {
  return {
    indiTrays: null,
    indiSingles: null,
    smallTrays: null,
    smallSingles: null,
    largeTrays: null,
    largeSingles: null,
    sicSingles: null,
    boliTrays: null,
    boliSingles: null,
    ...partial,
  };
}
