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

/** Trays and singles that belong together, with the balls a tray holds. */
const SPLIT_SIZES = [
  ['indiTrays', 'indiSingles', 'indi'],
  ['smallTrays', 'smallSingles', 'small'],
  ['largeTrays', 'largeSingles', 'large'],
  ['boliTrays', 'boliSingles', 'boli'],
] as const;

/**
 * A count coming back from the sheet, wearing the split this phone typed.
 *
 * The sheet stores one ball total per size, so every reload used to redraw
 * "22 trays" as something else. Where the phone's own trays and singles still
 * add up to the sheet's total, the sheet is only confirming what was typed —
 * so the typed boxes stay exactly as they were. Where the totals differ (the
 * other phone changed it), the sheet's figure wins, as before.
 */
export function keepTypedSplit<T extends Record<string, string>>(
  fetched: T,
  typed: Record<string, string> | undefined,
  ballsPerTray: { indi: number; small: number; large: number; boli: number },
): T {
  if (!typed) return fetched;
  const out: Record<string, string> = { ...fetched };
  const total = (from: Record<string, string>, traysKey: string, singlesKey: string, perTray: number) => {
    const trays = toNumOrNull(from[traysKey] ?? '');
    const singles = toNumOrNull(from[singlesKey] ?? '');
    return trays === null && singles === null ? null : (trays ?? 0) * perTray + (singles ?? 0);
  };
  for (const [traysKey, singlesKey, size] of SPLIT_SIZES) {
    const perTray = ballsPerTray[size];
    if (total(fetched, traysKey, singlesKey, perTray) === total(typed, traysKey, singlesKey, perTray)) {
      out[traysKey] = typed[traysKey] ?? '';
      out[singlesKey] = typed[singlesKey] ?? '';
    }
  }
  return out as T;
}
