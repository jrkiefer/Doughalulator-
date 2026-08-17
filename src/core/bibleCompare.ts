import type { AppConfig } from '../config';
import type { BibleSizeKey, PerBibleSize } from './types';

/**
 * Turning a bible row into trays and batches, so two bibles can be laid over
 * each other on a graph.
 *
 * The division is PLAIN — each size's need divided by what fits on its tray,
 * fractions kept (owner's own definition, Aug 2026). Rounding each size up to
 * a whole tray first, the way a real night's make does, overstates the total:
 * on peach row 1 it gives 19 trays against the binder's own 17, where plain
 * division gives 17.98. A graph is a comparison, not a make order — the
 * fractions are what make two bibles differ visibly at all.
 *
 * This is deliberately NOT a night's batch count. It answers "what would
 * tomorrow's whole need take, from nothing", with no dough on hand and no
 * rounding to the mixer — the only footing on which two bibles are comparable.
 * Boli is absent for the same reason it is absent from the bibles: it is a
 * top-up against a fixed target, not a figure the bible has an opinion on.
 */

const BIBLE_SIZES: BibleSizeKey[] = ['indi', 'small', 'large', 'sic'];

/** Balls per tray for each bible size. Sicilian's comes from its make-tray. */
export function perTraySizes(config: AppConfig): Record<BibleSizeKey, number> {
  return {
    indi: config.ballsPerTray.indi,
    small: config.ballsPerTray.small,
    large: config.ballsPerTray.large,
    sic: config.sicMakeTraySize,
  };
}

/** Trays a whole bible row would take, fractions kept. */
export function traysForNeeds(needs: PerBibleSize, config: AppConfig): number {
  const perTray = perTraySizes(config);
  return BIBLE_SIZES.reduce((sum, size) => sum + needs[size] / perTray[size], 0);
}

/** Those trays as batches, to two decimal places — the graph's Batches line. */
export function batchesForNeeds(needs: PerBibleSize, config: AppConfig): number {
  const batches = traysForNeeds(needs, config) / config.traysPerBatch;
  return Math.round(batches * 100) / 100;
}
