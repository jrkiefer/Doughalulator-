/**
 * Sheet reads for the dough log (saves go through the sync engine). All
 * fetches resolve to explicit results — nothing here throws.
 */
import type { BibleSizeKey, Bibles } from '../core/types';
import { getJson, postJson } from './client';
import {
  biblesToPayload,
  countsRowToFields,
  DAY_TAB,
  eonCountRowToFinalSales,
  EON_TAB,
  salesRowToBible,
  salesRowToFields,
  summaryRowsToHistory,
  summaryRowToForecastRounding,
  summaryRowToRounding,
  type HistorySummary,
} from './mapping';
import { cacheHistory, cachedHistory } from './local';
import { DOUGH_URL } from './sheets';

/** 'YYYY-MM-DD' ± days, timezone-safe. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

type SheetRow = Record<string, string | number>;

/** What a sheet fetch for one date turns into (form-shaped, blanks preserved). */
export interface FetchedDay {
  sales: { todayForecast: string; currentSales: string; tomorrowForecast: string } | null;
  counts: Record<string, string> | null;
  /** The tapped BATCH-rounding pill; null = auto. */
  rounding: 'down' | 'up' | null;
  /** The tapped FORECAST-rounding pill; null = auto. */
  forecastRound: 'down' | 'up' | null;
  bible: 'regular' | 'peach' | null;
  eonCounts: Record<string, string> | null;
  finalSales: string | null;
}

export type FetchDayResult =
  | { kind: 'loaded'; day: FetchedDay }
  | { kind: 'empty' } // the sheet answered: no row for this date
  | { kind: 'unreachable' }
  | { kind: 'rejected'; reason: string };

/** Fetch one date from the sheet. The caller decides how to merge (§4). */
export async function fetchDate(date: string): Promise<FetchDayResult> {
  const outcome = await getJson(DOUGH_URL, {
    action: 'date',
    date,
  });
  if (outcome.kind === 'retryable') return { kind: 'unreachable' };
  if (outcome.kind === 'rejected') return { kind: 'rejected', reason: outcome.reason };

  const t = (outcome.data as { tabs?: Record<string, SheetRow | null> }).tabs ?? {};
  const day = t[DAY_TAB];
  const eon = t[EON_TAB];
  if (!day && !eon) return { kind: 'empty' };
  return {
    kind: 'loaded',
    day: {
      sales: day ? salesRowToFields(day) : null,
      counts: day ? countsRowToFields(day) : null,
      rounding: day ? summaryRowToRounding(day) : null,
      forecastRound: day ? summaryRowToForecastRounding(day) : null,
      bible: day ? salesRowToBible(day) : null,
      eonCounts: eon ? countsRowToFields(eon, 'EON ') : null,
      finalSales: eon ? eonCountRowToFinalSales(eon) : null,
    },
  };
}

/** History card data: phone cache instantly, sheet refresh when reachable. */
export async function fetchHistory(
  days = 30,
): Promise<{ summaries: HistorySummary[]; source: 'sheet' | 'phone' }> {
  const outcome = await getJson(DOUGH_URL, {
    action: 'recent',
    n: String(days),
  });
  if (outcome.kind === 'ok') {
    const dates =
      (outcome.data as { dates?: Record<string, Record<string, SheetRow | null> | null> })
        .dates ?? {};
    const summaries = summaryRowsToHistory(dates);
    cacheHistory(summaries);
    return { summaries, source: 'sheet' };
  }
  return { summaries: cachedHistory(), source: 'phone' };
}

// ————— the self-building bible, for the graph —————

/** One threshold: what the bible says today beside what the nights suggest. */
export interface BibleBuildRow {
  sales: number;
  old: Record<BibleSizeKey, number | null>;
  new: Record<BibleSizeKey, number | null>;
}

export interface BibleBuild {
  regular: BibleBuildRow[];
  peach: BibleBuildRow[];
}

export type FetchBibleBuildResult =
  | { kind: 'loaded'; build: BibleBuild }
  | { kind: 'unreachable' }
  | { kind: 'rejected'; reason: string };

/**
 * Pull both bibles' suggestion blocks for the graph.
 *
 * The script keys them 'dough'/'peach'; the app has always called the first one
 * 'regular', so the rename happens here rather than leaking a second name for
 * the same bible into the screen.
 *
 * A script that predates this action answers `unknown action: bibles`, which
 * arrives as `rejected` — the graph tells the owner their spreadsheet needs
 * updating instead of retrying something that can never succeed.
 */
export async function fetchBibleBuild(): Promise<FetchBibleBuildResult> {
  const outcome = await getJson(DOUGH_URL, { action: 'bibles' });
  if (outcome.kind === 'retryable') return { kind: 'unreachable' };
  if (outcome.kind === 'rejected') return { kind: 'rejected', reason: outcome.reason };
  const raw = (outcome.data as { bibles?: Record<string, BibleBuildRow[]> }).bibles ?? {};
  return { kind: 'loaded', build: { regular: raw.dough ?? [], peach: raw.peach ?? [] } };
}

/** Mirror the bible tables to the sheet; the script no-ops when the hash is unchanged. Never throws. */
export async function syncBibles(bibles: Bibles): Promise<void> {
  await postJson(DOUGH_URL, {
    ...biblesToPayload(bibles),
  });
}
