import type { AppConfig } from '../config';
import type { CountedInventory, PerSize } from './types';

/** Balls on hand per size: trays × ballsPerTray + singles. Sicilian is singles only. */
export function computeHave(counts: CountedInventory, config: AppConfig): PerSize {
  const bpt = config.ballsPerTray;
  return {
    indi: counts.indiTrays * bpt.indi + counts.indiSingles,
    small: counts.smallTrays * bpt.small + counts.smallSingles,
    large: counts.largeTrays * bpt.large + counts.largeSingles,
    sic: counts.sicSingles,
    boil: counts.boilTrays * bpt.boil + counts.boilSingles,
  };
}
