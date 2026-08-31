/**
 * The pure calculation engine's public face. Everything exported here is a
 * pure function: dates, data and config always come in as arguments — no
 * React, no I/O, no clock — which is what keeps every rule in core testable
 * to the ball.
 */
export { normalizeSales } from './sales';
export {
  selectBibleId,
  getBible,
  lookupBibleRow,
  rowToNeeds,
  isSlowDay,
  resolveForecastRound,
} from './bible';
export { computeHave, computeCountedSizes } from './counting';
export { traysForNeeds, batchesForNeeds, perTraySizes } from './bibleCompare';
export { runDoughCalculation, buildBatchOption, splitTrayDelta } from './dough';
export { runEonCalculation, computeAmUse } from './eon';
export { slotForTime, type TempSlot } from './tempSlots';
export type * from './types';
