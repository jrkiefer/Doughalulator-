import type { CountedInventory } from '../../core/types';

/** The nine dough-count fields, kept as strings so inputs can be empty. */
export interface CountsFields {
  indiTrays: string;
  indiSingles: string;
  smallTrays: string;
  smallSingles: string;
  largeTrays: string;
  largeSingles: string;
  sicSingles: string;
  boilTrays: string;
  boilSingles: string;
}

export const emptyCountsFields: CountsFields = {
  indiTrays: '',
  indiSingles: '',
  smallTrays: '',
  smallSingles: '',
  largeTrays: '',
  largeSingles: '',
  sicSingles: '',
  boilTrays: '',
  boilSingles: '',
};

/** '' or junk → 0; otherwise the typed number. */
export function toNum(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export function parseCounts(fields: CountsFields): CountedInventory {
  return {
    indiTrays: toNum(fields.indiTrays),
    indiSingles: toNum(fields.indiSingles),
    smallTrays: toNum(fields.smallTrays),
    smallSingles: toNum(fields.smallSingles),
    largeTrays: toNum(fields.largeTrays),
    largeSingles: toNum(fields.largeSingles),
    sicSingles: toNum(fields.sicSingles),
    boilTrays: toNum(fields.boilTrays),
    boilSingles: toNum(fields.boilSingles),
  };
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}
