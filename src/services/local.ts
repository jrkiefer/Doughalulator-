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

const STORE_VERSION = 2;
const PREFIX = `doughalulator.v${STORE_VERSION}.`;
const DATE_PREFIX = `${PREFIX}date.`;
const HISTORY_KEY = `${PREFIX}history`;
/**
 * Keys no longer read by anything, swept at boot: the pre-rename snapshots, the
 * retired queue, and the latest-temps cache that LOAD LAST TEMPS used before
 * that button was removed.
 */
const STALE_PREFIXES = [
  'doughalulator.day.',
  'doughalulator.temps.',
  'doughalulator.queue',
  `${PREFIX}temps.latest`,
  'doughalulator.settings', // the sheet addresses are built in now
];

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

// ————— forgetting long-finished dates —————

/**
 * How long a finished date stays on the phone. Past this the sheet is the
 * record: opening an older date fetches it back. Nothing the app reaches for
 * on its own is anywhere near this far back — the morning's use wants
 * yesterday, and the History card keeps its own cache.
 */
export const KEEP_DAYS = 90;

/**
 * Which cached dates are safe to forget: older than the cutoff AND fully
 * confirmed by the sheet. Anything still unsent — or parked with a refusal —
 * stays, because for those the phone is the only copy there is.
 *
 * Pure on purpose: the tests run without a browser, so the decision lives
 * here where it can be checked and only the storage walk below cannot.
 */
export function datesToPrune(
  entries: { date: string; entry: DateEntry }[],
  cutoff: string,
): string[] {
  return entries
    .filter(({ date, entry }) => date < cutoff && isFullyConfirmed(entry))
    .map(({ date }) => date);
}

function isFullyConfirmed(entry: DateEntry): boolean {
  return (['day', 'eon', 'temps'] as const).every((type) => {
    const rec = entry[type];
    return !rec || (rec.syncedAt >= rec.updatedAt && rec.rejectedReason === null);
  });
}

/** Boot housekeeping: drop confirmed dates older than the cutoff. */
export function pruneOldDates(cutoff: string): void {
  const entries = listCachedDates()
    .map((date) => ({ date, entry: loadEntry(date) }))
    .filter((e): e is { date: string; entry: DateEntry } => e.entry !== null);
  for (const date of datesToPrune(entries, cutoff)) clearEntry(date);
}

// ————— history card cache —————

export function cachedHistory(): HistorySummary[] {
  return read<HistorySummary[]>(HISTORY_KEY) ?? [];
}

export function cacheHistory(summaries: HistorySummary[]): void {
  write(HISTORY_KEY, summaries);
}

// There is no latest-temps cache any more: the button that read it is gone, so
// its key is swept off the phone instead (see STALE_PREFIXES above).
