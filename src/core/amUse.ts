import type { AmUseResult, EonRecord, PerSize } from './types';

/**
 * Morning use: yesterday's end-of-night dough minus this morning's count,
 * all five sizes. Negatives pass through (they mean a miscount somewhere).
 * Null when yesterday has no EON record (closed days stay blank).
 * currentSales is the already-expanded 2 PM sales figure.
 */
export function computeAmUse(
  yesterdayEonRecord: Pick<EonRecord, 'eonHave'> | null,
  todayHave: PerSize,
  currentSales: number,
): AmUseResult | null {
  if (!yesterdayEonRecord) return null;
  const y = yesterdayEonRecord.eonHave;
  return {
    amSales: currentSales,
    amUse: {
      indi: y.indi - todayHave.indi,
      small: y.small - todayHave.small,
      large: y.large - todayHave.large,
      sic: y.sic - todayHave.sic,
      boil: y.boil - todayHave.boil,
    },
  };
}
