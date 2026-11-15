/**
 * The pure calculation engine's public face. Everything exported here is a
 * pure function: dates, data and config always come in as arguments — no
 * React, no I/O, no clock — which is what keeps every rule in core testable
 * to the ball.
 */
export { normalizeSales } from './sales';
export { selectBibleId, lookupBibleRow } from './bible';
export { batchesForNeeds } from './bibleCompare';
export { runDoughCalculation } from './dough';
export { runEonCalculation } from './eon';
export { slotForTime, type TempSlot } from './tempSlots';
export type * from './types';
