/**
 * Sheet reads for the dough log (saves go through the sync engine). All
 * fetches resolve to explicit results — nothing here throws.
 */
import type { AppConfig } from '../config';
import type { Bibles } from '../core/types';
import { getJson, postJson } from './client';
import {
  biblesToPayload,
  countsRowToFields,
  eonCountRowToFinalSales,
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
  config: AppConfig,
): Promise<FetchDayResult> {
  if (!settings.doughUrl.trim()) return { kind: 'unreachable' };
  const outcome = await getJson(settings.doughUrl, {
    secret: settings.doughSecret,
    action: 'date',
    date,
  });
  if (outcome.kind === 'retryable') return { kind: 'unreachable' };
  if (outcome.kind === 'rejected') return { kind: 'rejected', reason: outcome.reason };

  const t = (outcome.data as { tabs?: Record<string, SheetRow | null> }).tabs ?? {};
  if (!t['Sales'] && !t['Dough Count'] && !t['EON Count']) return { kind: 'empty' };
  return {
    kind: 'loaded',
    day: {
      sales: t['Sales'] ? salesRowToFields(t['Sales']) : null,
      counts: t['Dough Count'] ? countsRowToFields(t['Dough Count']) : null,
      rounding: t['Summary'] ? summaryRowToRounding(t['Summary']) : null,
      bible: t['Sales'] ? salesRowToBible(t['Sales'], config) : null,
      eonCounts: t['EON Count'] ? countsRowToFields(t['EON Count']) : null,
      finalSales: t['EON Count'] ? eonCountRowToFinalSales(t['EON Count']) : null,
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
      secret: settings.doughSecret,
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
    secret: settings.doughSecret,
    ...biblesToPayload(bibles),
  });
}

/** Test Connection for the dough sheet. Returns an error message or null when fine. */
export async function pingDough(settings: SheetSettings): Promise<string | null> {
  const outcome = await getJson(settings.doughUrl, {
    secret: settings.doughSecret,
    action: 'ping',
  });
  if (outcome.kind === 'ok') return null;
  return outcome.kind === 'rejected' ? outcome.reason : outcome.error;
}
