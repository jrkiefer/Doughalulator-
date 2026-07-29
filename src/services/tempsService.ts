import type { AppConfig } from '../config';
import type { TempSlot } from '../core';
import { getJson, postJson } from './client';
import { cacheTempsSave, cachedLatestTemps, enqueue, type LatestTemps } from './local';
import { tempsToPayload } from './mapping';
import type { SheetSettings } from './settings';
import type { SaveOutcome } from './doughService';

/** The temps save: cache on the phone, then sync or queue. Throws if nothing was entered. */
export async function saveTemps(
  date: string,
  time: string,
  slot: TempSlot,
  values: Record<string, string>,
  settings: SheetSettings,
  config: AppConfig,
): Promise<SaveOutcome> {
  const payload = tempsToPayload(date, time, slot, values, config);
  if (payload.readings.length === 0) throw new Error('no readings entered');
  cacheTempsSave(payload);

  if (settings.tempsUrl.trim()) {
    try {
      await postJson(settings.tempsUrl, { secret: settings.tempsSecret, ...payload });
      return 'synced';
    } catch {
      // fall through to the queue
    }
  }
  enqueue('temps', payload); // secret injected at send time by the queue
  return 'queued';
}

/** Latest reading per station for LOAD LAST TEMPS. Network first, cache fallback. */
export async function fetchLatestTemps(settings: SheetSettings): Promise<LatestTemps | null> {
  if (settings.tempsUrl.trim()) {
    try {
      const data = (await getJson(settings.tempsUrl, {
        secret: settings.tempsSecret,
        action: 'latest',
      })) as { stations?: Record<string, { temp: string; slot: string; when: string }> };
      if (data.stations) {
        const out: LatestTemps = {};
        for (const [station, r] of Object.entries(data.stations)) {
          const temp = Number(r.temp);
          if (Number.isFinite(temp)) out[station] = { temp, slot: r.slot, when: r.when };
        }
        return out;
      }
    } catch {
      // fall through to the phone cache
    }
  }
  return cachedLatestTemps();
}

/** Test Connection for the temps sheet. Returns an error message or null when fine. */
export async function pingTemps(settings: SheetSettings): Promise<string | null> {
  try {
    await getJson(settings.tempsUrl, { secret: settings.tempsSecret, action: 'ping' });
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
