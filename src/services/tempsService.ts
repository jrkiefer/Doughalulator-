/**
 * Sheet reads for the temp log (saves go through the sync engine) plus the
 * temps payload builder the engine uses.
 */
import type { AppConfig } from '../config';
import type { TempSlot } from '../core';
import { type TempsEntry } from './local';
import { tempsToPayload } from './mapping';
import { getJson } from './client';
import { TEMPS_URL } from './sheets';

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

/**
 * There is deliberately no "load the last readings" here (owner's choice,
 * Aug 2026). Copying yesterday's temperatures into today's slot files them as
 * measurements taken now, which is falsifying a food-safety record. Every
 * reading is typed. The sheet's script still answers `action: 'latest'` for the
 * Overview tab; nothing in the app asks it any more.
 */

// ————— the temp graph's read —————

/** One entry from the Log: when it was taken and what it read. */
export interface TempReading {
  date: string;
  time: string;
  slot: string;
  temp: number;
}

export type RecentTemps = Record<string, TempReading[]>;

export type FetchRecentTempsResult =
  | { kind: 'loaded'; stations: RecentTemps }
  | { kind: 'unreachable' }
  | { kind: 'rejected'; reason: string };

/**
 * The last few readings per station, oldest first, straight off the Log.
 * A script that predates the graph answers `unknown action: recent`, which
 * arrives as `rejected` — the drawer tells the owner the Temp Log needs its
 * one-off update instead of retrying something that can never succeed.
 */
export async function fetchRecentTemps(): Promise<FetchRecentTempsResult> {
  const outcome = await getJson(TEMPS_URL, { action: 'recent' });
  if (outcome.kind === 'retryable') return { kind: 'unreachable' };
  if (outcome.kind === 'rejected') return { kind: 'rejected', reason: outcome.reason };
  const raw = (outcome.data as { stations?: RecentTemps }).stations ?? {};
  return { kind: 'loaded', stations: raw };
}
