import type { CountedInventory, Maybe } from '../../core/types';

/** The nine dough-count fields, kept as strings so blank ≠ zero survives the form. */
export interface CountsFields {
  indiTrays: string;
  indiSingles: string;
  smallTrays: string;
  smallSingles: string;
  largeTrays: string;
  largeSingles: string;
  sicSingles: string;
  boliTrays: string;
  boliSingles: string;
}

export const emptyCountsFields: CountsFields = {
  indiTrays: '',
  indiSingles: '',
  smallTrays: '',
  smallSingles: '',
  largeTrays: '',
  largeSingles: '',
  sicSingles: '',
  boliTrays: '',
  boliSingles: '',
};

/** Blank (or junk) → null — "not entered". A typed 0 is a real zero. */
export function toNumOrNull(value: string): Maybe {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : null;
}

export function parseCounts(fields: CountsFields): CountedInventory {
  return {
    indiTrays: toNumOrNull(fields.indiTrays),
    indiSingles: toNumOrNull(fields.indiSingles),
    smallTrays: toNumOrNull(fields.smallTrays),
    smallSingles: toNumOrNull(fields.smallSingles),
    largeTrays: toNumOrNull(fields.largeTrays),
    largeSingles: toNumOrNull(fields.largeSingles),
    sicSingles: toNumOrNull(fields.sicSingles),
    boliTrays: toNumOrNull(fields.boliTrays),
    boliSingles: toNumOrNull(fields.boliSingles),
  };
}

export function fmt(n: number): string {
  return n.toLocaleString('en-US');
}

/** '—' for unknowns, the number otherwise. */
export function fmtMaybe(n: Maybe): string {
  return n === null ? '—' : fmt(n);
}
