/**
 * Everything kept on the phone: saved records (so the app works offline and
 * loads are instant) and the offline queue of saves that still need to reach
 * the sheets.
 */
import type { AmUseResult, DoughDayRecord, EonRecord } from '../core/types';
import type { TempsPayload } from './mapping';

export interface CachedDay {
  day?: DoughDayRecord;
  amUse?: AmUseResult | null;
  eon?: EonRecord;
}

export interface QueueItem {
  id: string;
  target: 'dough' | 'temps';
  payload: unknown;
  queuedAt: string;
}

const DAY_PREFIX = 'doughalulator.day.';
const TEMPS_PREFIX = 'doughalulator.temps.';
const LATEST_TEMPS_KEY = 'doughalulator.temps.latest';
const QUEUE_KEY = 'doughalulator.queue';

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  localStorage.setItem(key, JSON.stringify(value));
}

// ————— day records —————

export function cachedDay(date: string): CachedDay {
  return read<CachedDay>(DAY_PREFIX + date) ?? {};
}

export function cacheDayPatch(date: string, patch: Partial<CachedDay>): void {
  write(DAY_PREFIX + date, { ...cachedDay(date), ...patch });
}

// ————— temps —————

export type LatestTemps = Record<string, { temp: number; slot: string; when: string }>;

export function cacheTempsSave(payload: TempsPayload): void {
  const grid = read<Record<string, Record<string, number>>>(TEMPS_PREFIX + payload.date) ?? {};
  for (const r of payload.readings) {
    grid[r.station] = { ...grid[r.station], [payload.slot]: r.temp };
  }
  write(TEMPS_PREFIX + payload.date, grid);

  const latest = read<LatestTemps>(LATEST_TEMPS_KEY) ?? {};
  for (const r of payload.readings) {
    latest[r.station] = { temp: r.temp, slot: payload.slot, when: `${payload.date} ${payload.time}` };
  }
  write(LATEST_TEMPS_KEY, latest);
}

export function cachedLatestTemps(): LatestTemps | null {
  return read<LatestTemps>(LATEST_TEMPS_KEY);
}

// ————— offline queue —————

export function queuedItems(): QueueItem[] {
  return read<QueueItem[]>(QUEUE_KEY) ?? [];
}

export function enqueue(target: 'dough' | 'temps', payload: unknown): void {
  const items = queuedItems();
  items.push({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    target,
    payload,
    queuedAt: new Date().toISOString(),
  });
  write(QUEUE_KEY, items);
}

export function replaceQueue(items: QueueItem[]): void {
  write(QUEUE_KEY, items);
}
