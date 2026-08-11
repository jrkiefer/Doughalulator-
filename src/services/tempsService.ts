/**
 * Sheet reads for the temp log (saves go through the sync engine) plus the
 * temps payload builder the engine uses.
 */
import type { AppConfig } from '../config';
import type { TempSlot } from '../core';
import { getJson } from './client';
import { cachedLatestTemps, cacheLatestTemps, type LatestTemps, type TempsEntry } from './local';
import { tempsToPayload } from './mapping';
import type { SheetSettings } from './settings';

const SLOTS: TempSlot[] = ['morning', 'midday', 'night'];

/**
 * One payload for a whole day of temps: one item per slot that has readings.
 * Times are the per-slot last-edit clock stamps (kept in the entry so the
 * payload — and its dedupe hash — is stable across flushes).
 */
export function tempsEntryToPayload(
  date: string,
  entry: TempsEntry,
  config: AppConfig,
): object | null {
  const items = SLOTS.flatMap((slot) => {
    const single = tempsToPayload(date, entry.times?.[slot] ?? '00:00', slot, entry.readings[slot], config);
    return single.readings.length > 0
      ? [{ time: single.time, slot: single.slot, readings: single.readings }]
      : [];
  });
  if (items.length === 0) return null;
  return { type: 'temps', date, items };
}

/** Latest reading per station for LOAD LAST TEMPS. Sheet first, phone cache fallback. */
export async function fetchLatestTemps(settings: SheetSettings): Promise<LatestTemps | null> {
  if (settings.tempsUrl.trim()) {
    const outcome = await getJson(settings.tempsUrl, {
      action: 'latest',
    });
    if (outcome.kind === 'ok') {
      const stations = (outcome.data as {
        stations?: Record<string, { temp: string; slot: string; when: string }>;
      }).stations;
      if (stations) {
        const out: LatestTemps = {};
        for (const [station, r] of Object.entries(stations)) {
          const temp = Number(r.temp);
          if (Number.isFinite(temp)) out[station] = { temp, slot: r.slot, when: r.when };
        }
        cacheLatestTemps(out);
        return out;
      }
    }
  }
  return cachedLatestTemps();
}

/** Test Connection for the temps sheet. Returns an error message or null when fine. */
export async function pingTemps(settings: SheetSettings): Promise<string | null> {
  const outcome = await getJson(settings.tempsUrl, {
    action: 'ping',
  });
  if (outcome.kind === 'ok') return null;
  return outcome.kind === 'rejected' ? outcome.reason : outcome.error;
}
