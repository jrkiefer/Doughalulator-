import type { AmUseResult, Bibles, DoughDayRecord, EonRecord, PerSize } from '../core/types';
import { getJson, postJson } from './client';
import {
  biblesToPayload,
  countsRowToFields,
  dayRecordToTabWrites,
  eonCountRowToFinalSales,
  eonCountRowToHave,
  eonRecordToTabWrites,
  salesRowToFields,
  summaryRowToRounding,
} from './mapping';
import { cacheDayPatch, cachedDay, enqueue } from './local';
import type { SheetSettings } from './settings';

export type SaveOutcome = 'synced' | 'queued';

/** 'YYYY-MM-DD' ± days, timezone-safe. */
export function addDays(date: string, delta: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/**
 * The queue stores payloads WITHOUT the secret — it gets injected at send
 * time, so saves queued before Settings were filled in still sync later.
 */
async function postOrQueue(payload: object, settings: SheetSettings): Promise<SaveOutcome> {
  if (settings.doughUrl.trim()) {
    try {
      await postJson(settings.doughUrl, { secret: settings.doughSecret, ...payload });
      return 'synced';
    } catch {
      // fall through to the queue
    }
  }
  enqueue('dough', payload);
  return 'queued';
}

/** The 2 PM save: cache on the phone, then sync or queue. */
export async function saveDayRecord(
  record: DoughDayRecord,
  amUse: AmUseResult | null,
  settings: SheetSettings,
): Promise<SaveOutcome> {
  cacheDayPatch(record.date, { day: record, amUse });
  const payload = {
    type: 'day',
    date: record.date,
    tabs: dayRecordToTabWrites(record, amUse),
  };
  return postOrQueue(payload, settings);
}

/** The EON save: cache on the phone, then sync or queue. */
export async function saveEonRecord(
  record: EonRecord,
  settings: SheetSettings,
): Promise<SaveOutcome> {
  cacheDayPatch(record.date, { eon: record });
  const payload = {
    type: 'eon',
    date: record.date,
    tabs: eonRecordToTabWrites(record),
  };
  return postOrQueue(payload, settings);
}

/** Mirror the bible tables to the sheet; the script no-ops when the hash is unchanged. Never throws. */
export async function syncBibles(bibles: Bibles, settings: SheetSettings): Promise<void> {
  if (!settings.doughUrl.trim()) return;
  try {
    await postJson(settings.doughUrl, {
      secret: settings.doughSecret,
      ...biblesToPayload(bibles),
    });
  } catch {
    // Reference tabs only — never worth bothering the owner about.
  }
}

/** What LOAD FROM SHEET pulls back into the forms. */
export interface LoadedDay {
  source: 'sheet' | 'phone';
  sales: { todayForecast: string; currentSales: string; tomorrowForecast: string } | null;
  counts: Record<string, string> | null;
  rounding: 'down' | 'up' | null;
  eonCounts: Record<string, string> | null;
  finalSales: string | null;
}

interface DateTabsResponse {
  tabs: Record<string, Record<string, string> | null>;
}

/** Network first, phone cache as fallback. Null when the date exists nowhere. */
export async function loadDate(date: string, settings: SheetSettings): Promise<LoadedDay | null> {
  if (settings.doughUrl.trim()) {
    try {
      const data = (await getJson(settings.doughUrl, {
        secret: settings.doughSecret,
        action: 'date',
        date,
      })) as unknown as DateTabsResponse;
      const t = data.tabs;
      if (t['Sales'] || t['Dough Count'] || t['EON Count']) {
        return {
          source: 'sheet',
          sales: t['Sales'] ? salesRowToFields(t['Sales']) : null,
          counts: t['Dough Count'] ? countsRowToFields(t['Dough Count']) : null,
          rounding: t['Summary'] ? summaryRowToRounding(t['Summary']) : null,
          eonCounts: t['EON Count'] ? countsRowToFields(t['EON Count']) : null,
          finalSales: t['EON Count'] ? eonCountRowToFinalSales(t['EON Count']) : null,
        };
      }
      return null;
    } catch {
      // fall through to the phone cache
    }
  }

  const cached = cachedDay(date);
  if (!cached.day && !cached.eon) return null;
  const day = cached.day;
  const eon = cached.eon;
  return {
    source: 'phone',
    sales: day
      ? {
          todayForecast: String(day.todayForecastRaw),
          currentSales: String(day.currentSalesRaw),
          tomorrowForecast: String(day.tomorrowForecastRaw),
        }
      : null,
    counts: day ? countsFromInventory(day.counts) : null,
    rounding: day?.chosenBatchOption ?? null,
    eonCounts: eon ? countsFromInventory(eon.counts) : null,
    finalSales: eon ? String(eon.finalSalesRaw) : null,
  };
}

function countsFromInventory(c: DoughDayRecord['counts']): Record<string, string> {
  return {
    indiTrays: String(c.indiTrays),
    indiSingles: String(c.indiSingles),
    smallTrays: String(c.smallTrays),
    smallSingles: String(c.smallSingles),
    largeTrays: String(c.largeTrays),
    largeSingles: String(c.largeSingles),
    sicSingles: String(c.sicSingles),
    boilTrays: String(c.boilTrays),
    boilSingles: String(c.boilSingles),
  };
}

/** Yesterday's end-of-night dough for the AM-use math. Network first, cache fallback. */
export async function fetchYesterdayEonHave(
  date: string,
  settings: SheetSettings,
): Promise<PerSize | null> {
  const yesterday = addDays(date, -1);

  if (settings.doughUrl.trim()) {
    try {
      const data = (await getJson(settings.doughUrl, {
        secret: settings.doughSecret,
        action: 'date',
        date: yesterday,
      })) as unknown as DateTabsResponse;
      const row = data.tabs['EON Count'];
      if (row) return eonCountRowToHave(row);
      return null; // the sheet answered: yesterday truly has no EON (closed day)
    } catch {
      // fall through to the phone cache
    }
  }

  return cachedDay(yesterday).eon?.eonHave ?? null;
}

/** Test Connection for the dough sheet. Returns an error message or null when fine. */
export async function pingDough(settings: SheetSettings): Promise<string | null> {
  try {
    await getJson(settings.doughUrl, { secret: settings.doughSecret, action: 'ping' });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
