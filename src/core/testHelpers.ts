import doughBibleJson from '../data/doughBible.json';
import peachBibleJson from '../data/peachBible.json';
import type { Bible, Bibles, CountedInventory } from './types';

export const regularBible = doughBibleJson as Bible;
export const peachBible = peachBibleJson as Bible;
export const bibles: Bibles = { regular: regularBible, peach: peachBible };

/** Build a full inventory count from just the non-zero parts. */
export function counts(partial: Partial<CountedInventory> = {}): CountedInventory {
  return {
    indiTrays: 0,
    indiSingles: 0,
    smallTrays: 0,
    smallSingles: 0,
    largeTrays: 0,
    largeSingles: 0,
    sicSingles: 0,
    boilTrays: 0,
    boilSingles: 0,
    ...partial,
  };
}
