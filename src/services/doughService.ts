/**
 * Sheet reads for the dough log (saves go through the sync engine). All
 * fetches resolve to explicit results — nothing here throws.
 */
import type { Bibles } from '../core/types';
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
  summaryRowToRounding,
  type HistorySummary,
} from './mapping';
import { cacheHistory, cachedHistory } from './local';
import type { SheetSettings } from './settings';

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
  rounding: 'down' | 'up' | null;
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
export async function fetchDate(
  date: string,
  settings: SheetSettings,
): Promise<FetchDayResult> {
  if (!settings.doughUrl.trim()) return { kind: 'unreachable' };
  const outcome = await getJson(settings.doughUrl, {
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
      bible: day ? salesRowToBible(day) : null,
      eonCounts: eon ? countsRowToFields(eon, 'EON ') : null,
      finalSales: eon ? eonCountRowToFinalSales(eon) : null,
    },
  };
}

/** History card data: phone cache instantly, sheet refresh when reachable. */
export async function fetchHistory(
  settings: SheetSettings,
  days = 30,
): Promise<{ summaries: HistorySummary[]; source: 'sheet' | 'phone' }> {
  if (settings.doughUrl.trim()) {
    const outcome = await getJson(settings.doughUrl, {
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
  }
  return { summaries: cachedHistory(), source: 'phone' };
}

/** Mirror the bible tables to the sheet; the script no-ops when the hash is unchanged. Never throws. */
export async function syncBibles(bibles: Bibles, settings: SheetSettings): Promise<void> {
  if (!settings.doughUrl.trim()) return;
  await postJson(settings.doughUrl, {
    ...biblesToPayload(bibles),
  });
}

/** Test Connection for the dough sheet. Returns an error message or null when fine. */
export async function pingDough(settings: SheetSettings): Promise<string | null> {
  const outcome = await getJson(settings.doughUrl, {
    action: 'ping',
  });
  if (outcome.kind === 'ok') return null;
  return outcome.kind === 'rejected' ? outcome.reason : outcome.error;
}
