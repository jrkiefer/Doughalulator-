import type { SalesShorthandRule } from '../config';

/**
 * Expand shorthand sales entry: values from 0 (exclusive) up to maxShorthand
 * (inclusive) mean thousands — 2.2 → 2,200; 50 → 50,000. Values above are
 * literal dollars; 0 stays 0.
 */
export function normalizeSales(raw: number, rule: SalesShorthandRule): number {
  if (raw > 0 && raw <= rule.maxShorthand) {
    return Math.round(raw * rule.multiplier);
  }
  return raw;
}
