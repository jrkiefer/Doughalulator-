import type { AppConfig, BibleId, RoundDirection } from '../config';
import type { Bible, BibleRow, Bibles, Maybe, PerBibleSize } from './types';

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
 * A slow day: BOTH forecasts entered and both strictly under the gate. It is
 * the one condition that makes the bible lookups and the batch count round
 * down instead of up.
 */
export function isSlowDay(
  todayForecast: Maybe,
  tomorrowForecast: Maybe,
  config: AppConfig,
): boolean {
  const gate = config.bibleRounding.slowDayUnder;
  return (
    todayForecast !== null &&
    tomorrowForecast !== null &&
    todayForecast < gate &&
    tomorrowForecast < gate
  );
}

/**
 * Which way the bible lookups round tonight: a tapped pill wins outright,
 * otherwise a slow day rounds down and every other night rounds up.
 */
export function resolveForecastRound(
  stamp: RoundDirection | null | undefined,
  todayForecast: Maybe,
  tomorrowForecast: Maybe,
  config: AppConfig,
): RoundDirection {
  return stamp ?? (isSlowDay(todayForecast, tomorrowForecast, config) ? 'down' : 'up');
}

/**
 * Find the row for a sales figure. Exact match wins. Below the lowest row →
 * lowest row; above the highest → highest.
 *
 * Between two rows the default is UP. Rounding DOWN takes the row below —
 * but never a drop of more than `maxRoundDownGap`, even when the direction was
 * tapped by hand: a wider gap is too much dough to shed on one lookup, so it
 * falls back to up.
 */
export function lookupBibleRow(
  bible: Bible,
  sales: number,
  config: AppConfig,
  direction: RoundDirection = 'up',
): BibleRow {
  const rows = bible.rows;
  // Both bibles ship non-empty and ascending — bibleData.test.ts trips if a
  // future edit ever breaks that — so the two ends are asserted, not checked.
  const first = rows[0]!;
  const last = rows[rows.length - 1]!;
  if (sales <= first.sales) return first;
  if (sales >= last.sales) return last;

  if (direction === 'down') {
    // Walk up from the bottom to the highest row at or below the figure —
    // the row a round-down would land on — then apply the gap cap.
    for (let i = rows.length - 1; i >= 0; i--) {
      const row = rows[i]!;
      if (row.sales <= sales) {
        if (sales - row.sales <= config.bibleRounding.maxRoundDownGap) return row;
        break; // too far to drop — fall through to the round-up path
      }
    }
  }
  return rows.find((row) => row.sales >= sales) ?? last;
}

export function rowToNeeds(row: BibleRow): PerBibleSize {
  return { indi: row.indi, small: row.small, large: row.large, sic: row.sic };
}
