/**
 * Phone storage, version 2 (the v2 prefix discards pre-rename caches).
 * One entry per date holding the raw FORM state for each record type plus
 * sync bookkeeping — records themselves are recomputed from forms. Every
 * read/write is guarded: a full phone can never crash the app (writes
 * report failure so the sync engine can raise the §3e states).
 */
import type { TempSlot } from '../core';
import type { BibleId } from '../core/types';
import type { HistorySummary } from './mapping';

export const STORE_VERSION = 2;
const PREFIX = `doughalulator.v${STORE_VERSION}.`;
const DATE_PREFIX = `${PREFIX}date.`;
const HISTORY_KEY = `${PREFIX}history`;
const LATEST_TEMPS_KEY = `${PREFIX}temps.latest`;
/** Old-model keys (pre-rename snapshots + the retired queue) — swept at boot. */
const STALE_PREFIXES = ['doughalulator.day.', 'doughalulator.temps.', 'doughalulator.queue'];

/** Sync bookkeeping shared by all three record types. */
export interface SyncMeta {
  /** Stamped on every edit. */
  updatedAt: number;
  /** Stamped when the sheet confirmed this content (0 = never). */
  syncedAt: number;
  /** Hash of the last payload the sheet acknowledged — dedupes identical resends. */
  ackHash: string | null;
  /** Set when the sheet terminally refused this record; cleared by the next edit. */
  rejectedReason: string | null;
}

export interface DayEntry extends SyncMeta {
  form: Record<string, string>;
  rounding: 'down' | 'up' | null;
  bibleOverride: BibleId | null;
}

export interface EonEntry extends SyncMeta {
  form: Record<string, string>;
}

export interface TempsEntry extends SyncMeta {
  readings: Record<TempSlot, Record<string, string>>;
  /** Per-slot clock stamp of the last edit — keeps the payload hash stable. */
  times?: Partial<Record<TempSlot, string>>;
}

export interface DateEntry {
  day?: DayEntry;
  eon?: EonEntry;
  temps?: TempsEntry;
}

export function freshMeta(now: number): SyncMeta {
  return { updatedAt: now, syncedAt: 0, ackHash: null, rejectedReason: null };
}

function read<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Returns false when the phone refused the write (storage full). */
function write(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadEntry(date: string): DateEntry | null {
  return read<DateEntry>(DATE_PREFIX + date);
}

export function saveEntry(date: string, entry: DateEntry): boolean {
  return write(DATE_PREFIX + date, entry);
}

export function clearEntry(date: string): void {
  try {
    localStorage.removeItem(DATE_PREFIX + date);
  } catch {
    // nothing to do — a failed remove just leaves a stale cache entry
  }
}

export function listCachedDates(): string[] {
  const dates: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DATE_PREFIX)) dates.push(key.slice(DATE_PREFIX.length));
    }
  } catch {
    // storage unreadable — behave as empty
  }
  return dates.sort();
}

/** Drop pre-v2 keys so stale records with old field names are never half-read. */
export function sweepStaleKeys(): void {
  try {
    const stale: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && STALE_PREFIXES.some((p) => key.startsWith(p))) stale.push(key);
    }
    stale.forEach((key) => localStorage.removeItem(key));
  } catch {
    // best effort
  }
}

// ————— history card cache —————

export function cachedHistory(): HistorySummary[] {
  return read<HistorySummary[]>(HISTORY_KEY) ?? [];
}

export function cacheHistory(summaries: HistorySummary[]): void {
  write(HISTORY_KEY, summaries);
}

// ————— latest temps (LOAD LAST TEMPS fallback) —————

export type LatestTemps = Record<string, { temp: number; slot: string; when: string }>;

export function cachedLatestTemps(): LatestTemps | null {
  return read<LatestTemps>(LATEST_TEMPS_KEY);
}

export function cacheLatestTemps(latest: LatestTemps): void {
  write(LATEST_TEMPS_KEY, latest);
}
