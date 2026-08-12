import type { AppConfig } from '../config';
import type { CountedInventory, CountedSizes, Maybe, PerSizeMaybe } from './types';

/** A size counts as "counted" when at least one of its fields was entered. */
export function computeCountedSizes(counts: CountedInventory): CountedSizes {
  return {
    indi: counts.indiTrays !== null || counts.indiSingles !== null,
    small: counts.smallTrays !== null || counts.smallSingles !== null,
    large: counts.largeTrays !== null || counts.largeSingles !== null,
    sic: counts.sicSingles !== null,
    boli: counts.boliTrays !== null || counts.boliSingles !== null,
  };
}

function haveFor(counted: boolean, trays: Maybe, perTray: number, singles: Maybe): Maybe {
  if (!counted) return null;
  return (trays ?? 0) * perTray + (singles ?? 0);
}

/**
 * Balls on hand per size: trays × ballsPerTray + singles. Sicilian is singles
 * only. A fully blank size is null ("not counted"), never a fabricated 0;
 * within a counted size, a blank sibling field counts as 0.
 */
export function computeHave(counts: CountedInventory, config: AppConfig): PerSizeMaybe {
  const bpt = config.ballsPerTray;
  const counted = computeCountedSizes(counts);
  return {
    indi: haveFor(counted.indi, counts.indiTrays, bpt.indi, counts.indiSingles),
    small: haveFor(counted.small, counts.smallTrays, bpt.small, counts.smallSingles),
    large: haveFor(counted.large, counts.largeTrays, bpt.large, counts.largeSingles),
    // No `?? 0` here: `counted.sic` IS `sicSingles !== null`, so by this point
    // it cannot be blank. Spelling a fallback would invent a case.
    sic: counts.sicSingles,
    boli: haveFor(counted.boli, counts.boliTrays, bpt.boli, counts.boliSingles),
  };
}
