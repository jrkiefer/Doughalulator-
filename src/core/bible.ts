import type { AppConfig, BibleId } from '../config';
import type { Bible, BibleRow, Bibles, PerBibleSize } from './types';

/** 'YYYY-MM-DD' → 'MM-DD'. */
function monthDay(date: string): string {
  return date.slice(5);
}

/** Peach bible during peach season (dates inclusive), regular the rest of the year. */
export function selectBibleId(
  date: string,
  config: AppConfig,
  override?: BibleId,
): BibleId {
  if (override) return override;
  const md = monthDay(date);
  const { start, end } = config.peachSeason;
  return md >= start && md <= end ? 'peach' : 'regular';
}

export function getBible(bibles: Bibles, id: BibleId): Bible {
  return bibles[id];
}

/**
 * Find the row for a sales figure. Exact match wins. Below the lowest row →
 * lowest row; above the highest → highest. Between two rows, the config rule
 * decides: round DOWN below the threshold, UP at/above it.
 */
export function lookupBibleRow(
  bible: Bible,
  sales: number,
  config: AppConfig,
): BibleRow {
  const rows = bible.rows;
  const first = rows[0];
  const last = rows[rows.length - 1];
  if (sales <= first.sales) return first;
  if (sales >= last.sales) return last;

  for (let i = 0; i < rows.length - 1; i++) {
    const lower = rows[i];
    const upper = rows[i + 1];
    if (sales === lower.sales) return lower;
    if (sales > lower.sales && sales < upper.sales) {
      const rule = config.bibleRounding;
      const direction = sales < rule.threshold ? rule.below : rule.atOrAbove;
      return direction === 'down' ? lower : upper;
    }
  }
  return last;
}

export function rowToNeeds(row: BibleRow): PerBibleSize {
  return { indi: row.indi, small: row.small, large: row.large, sic: row.sic };
}
