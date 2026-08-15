import type { SalesShorthandRule } from '../config';

/**
 * Expand shorthand sales entry: values below `under` mean thousands —
 * 2.2 → 2,200; 99 → 99,000. From `under` upward they are literal dollars,
 * so 100 stays $100. 0 stays 0.
 */
export function normalizeSales(raw: number, rule: SalesShorthandRule): number {
  if (raw > 0 && raw < rule.under) {
    return Math.round(raw * rule.multiplier);
  }
  return raw;
}
