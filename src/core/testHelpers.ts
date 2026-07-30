import doughBibleJson from '../data/doughBible.json';
import peachBibleJson from '../data/peachBible.json';
import type { Bible, Bibles, CountedInventory } from './types';

export const regularBible = doughBibleJson as Bible;
export const peachBible = peachBibleJson as Bible;
export const bibles: Bibles = { regular: regularBible, peach: peachBible };

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
