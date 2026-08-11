/**
 * The local-first autosave + sync engine (§3–§4 of the parity spec).
 *
 * Every edit lands in memory, then on the phone, then — after a short
 * debounce — on the sheet. Nothing here throws: a full phone falls back to
 * memory-and-network, a dead network waits for the next trigger, and a
 * terminal "sheet said no" parks that one record with a reason without
 * blocking anything else.
 *
 * All effects (storage, network, clock, timers) are injected so the whole
 * engine runs under fake deps in tests.
 */
import { hashString } from './mapping';
import type { Outcome } from './client';
import {
  freshMeta,
  type DateEntry,
  type DayEntry,
  type EonEntry,
  type SyncMeta,
  type TempsEntry,
} from './local';

export type RecordType = 'day' | 'eon' | 'temps';
const TYPE_ORDER: RecordType[] = ['day', 'eon', 'temps'];
const TARGET_OF: Record<RecordType, 'dough' | 'temps'> = {
  day: 'dough',
  eon: 'dough',
  temps: 'temps',
};
/**
 * Records whose payload is DERIVED from another record's content: the EON
 * check depends on the day record's tomorrow-need. Editing the source
 * re-dirties existing dependents so the recomputed math re-syncs too.
 */
const DEPENDENTS: Partial<Record<RecordType, RecordType[]>> = { day: ['eon'] };

export interface SyncDeps {
  now(): number;
  loadEntry(date: string): DateEntry | null;
  /** Returns false when the phone refused the write (storage full). */
  saveEntry(date: string, entry: DateEntry): boolean;
  clearEntry(date: string): void;
  listDates(): string[];
  /**
   * Build the payload for one record, or null when there is nothing worth
   * sending (an empty record must never be posted).
   */
  buildPayload(type: RecordType, date: string, entry: DateEntry): object | null;
  post(
    target: 'dough' | 'temps',
    payload: object,
    opts?: { keepalive?: boolean },
  ): Promise<Outcome>;
  setTimer(fn: () => void, ms: number): ReturnType<typeof setTimeout>;
  clearTimer(id: ReturnType<typeof setTimeout>): void;
}

/** The honest status set surfaced in the header (§3f). */
export type SyncState =
  | 'new' // nothing entered for this date
  | 'saving' // edited moments ago, debounce pending
  | 'syncing' // saved on phone, flush in flight
  | 'synced'
  | 'offline' // dirty and the last attempt hit a network-class failure
  | 'rejected' // the sheet terminally refused a save (red)
  | 'unsaved'; // §3e both-fail: not on phone AND not on the sheet (red)

export interface SyncStatus {
  state: SyncState;
  /** The server's reason when state is 'rejected'. */
  reason: string | null;
  /** True when the record synced but could not be kept on the phone. */
  phoneWriteFailed: boolean;
}

export interface SyncEngine {
  getEntry(date: string): DateEntry;
  edit(date: string, type: 'day', apply: (rec: DayEntry) => void): void;
  edit(date: string, type: 'eon', apply: (rec: EonEntry) => void): void;
  edit(date: string, type: 'temps', apply: (rec: TempsEntry) => void): void;
  /** Replace a date's entry from a sheet fetch — only where the local copy is clean. */
  applyFetched(date: string, apply: (entry: DateEntry) => void): 'replaced' | 'kept-dirty';
  /** True when any of the date's records has unsynced typed content. */
  isDirty(date: string): boolean;
  /** Force-load path: overwrite local with fetched content and mark clean. */
  overwrite(date: string, apply: (entry: DateEntry) => void): void;
  /** Two-tap reset target: blank the date and make sure nothing ever posts. */
  reset(date: string): void;
  /** Note that an edit landed while a fetch was in flight (keystroke guard §4). */
  editSeq(date: string): number;
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  status(date: string): SyncStatus;
  subscribe(listener: () => void): () => void;
  /** Boot: resend anything dirty from earlier sessions. */
  start(): void;
}

function emptyDay(now: number): DayEntry {
  return { form: {}, rounding: null, bibleOverride: null, ...freshMeta(now) };
}

function emptyEon(now: number): EonEntry {
  return { form: {}, ...freshMeta(now) };
}

function emptyTemps(now: number): TempsEntry {
  return { readings: { morning: {}, midday: {}, night: {} }, ...freshMeta(now) };
}

function metaOf(entry: DateEntry, type: RecordType): SyncMeta | undefined {
  return entry[type];
}

export function createSyncEngine(deps: SyncDeps, debounceMs = 1000): SyncEngine {
  const memory = new Map<string, DateEntry>();
  const phoneFailed = new Set<string>(); // `${date}` whose last phone write failed
  const editSeqs = new Map<string, number>();
  let offline = false;
  let inFlight = false;
  let rerunAfterFlight = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const listeners = new Set<() => void>();

  function notify() {
    listeners.forEach((fn) => fn());
  }

  function getEntry(date: string): DateEntry {
    let entry = memory.get(date);
    if (!entry) {
      entry = deps.loadEntry(date) ?? {};
      memory.set(date, entry);
    }
    return entry;
  }

  function persist(date: string) {
    const ok = deps.saveEntry(date, getEntry(date));
    if (ok) phoneFailed.delete(date);
    else phoneFailed.add(date);
    return ok;
  }

  function scheduleFlush() {
    if (debounceTimer !== null) deps.clearTimer(debounceTimer);
    debounceTimer = deps.setTimer(() => {
      debounceTimer = null;
      void flush();
    }, debounceMs);
  }

  function isDirtyRecord(rec: SyncMeta | undefined): boolean {
    return !!rec && rec.updatedAt > rec.syncedAt && rec.rejectedReason === null;
  }

  function edit(date: string, type: RecordType, apply: (rec: never) => void): void {
    const entry = getEntry(date);
    const now = deps.now();
    if (type === 'day' && !entry.day) entry.day = emptyDay(now);
    if (type === 'eon' && !entry.eon) entry.eon = emptyEon(now);
    if (type === 'temps' && !entry.temps) entry.temps = emptyTemps(now);
    const rec = entry[type]!;
    apply(rec as never);
    rec.updatedAt = now;
    rec.rejectedReason = null; // an edit is a fresh attempt
    // A change here changes math derived elsewhere: re-dirty existing
    // dependents (never create one) so the whole picture re-syncs.
    for (const dependent of DEPENDENTS[type] ?? []) {
      const dep = entry[dependent];
      if (dep) {
        dep.updatedAt = now;
        dep.rejectedReason = null;
      }
    }
    editSeqs.set(date, (editSeqs.get(date) ?? 0) + 1);
    persist(date);
    scheduleFlush();
    notify();
  }

  /**
   * Push one sheet's dirty records in order (dates ascending, day before
   * eon). Returns true when a network-class failure stopped this sheet —
   * the record stays dirty for the next trigger.
   */
  async function flushTarget(
    target: 'dough' | 'temps',
    dates: string[],
    opts: { keepalive?: boolean },
  ): Promise<boolean> {
    for (const date of dates) {
      const entry = getEntry(date);
      for (const type of TYPE_ORDER) {
        if (TARGET_OF[type] !== target) continue;
        const rec = metaOf(entry, type);
        if (!rec || !isDirtyRecord(rec)) continue;

        const editStamp = rec.updatedAt;
        const payload = deps.buildPayload(type, date, entry);
        if (payload === null) {
          // Nothing worth sending — an empty record is clean by definition.
          rec.syncedAt = editStamp;
          persist(date);
          continue;
        }
        const hash = hashString(JSON.stringify(payload));
        if (hash === rec.ackHash) {
          rec.syncedAt = editStamp;
          persist(date);
          continue;
        }

        if (opts.keepalive) {
          // Page is going away: fire and forget. NEVER marked synced here —
          // if it landed, the next boot's resend dedupes server-side by merge.
          void deps.post(target, payload, { keepalive: true });
          continue;
        }

        const outcome = await deps.post(target, payload);
        if (outcome.kind === 'ok') {
          rec.syncedAt = editStamp;
          rec.ackHash = hash;
          offline = false;
          persist(date);
        } else if (outcome.kind === 'retryable') {
          // Network-class: keep dirty, stop bothering this sheet for now.
          return true;
        } else {
          // Terminal: park THIS record with the reason; everything else continues.
          rec.rejectedReason = outcome.reason;
          persist(date);
        }
        notify();
      }
    }
    return false;
  }

  async function flush(opts: { keepalive?: boolean } = {}): Promise<void> {
    if (inFlight) {
      rerunAfterFlight = true;
      return;
    }
    inFlight = true;
    // A direct flush (blur, tap, reconnect) supersedes the pending debounce —
    // but NOT a keepalive one, which never marks anything synced. Cancelling
    // there would leave a backgrounded page dirty with no retry scheduled.
    if (debounceTimer !== null && !opts.keepalive) {
      deps.clearTimer(debounceTimer);
      debounceTimer = null;
    }
    notify();
    try {
      const dates = [...new Set<string>([...deps.listDates(), ...memory.keys()])].sort();
      // The two sheets are independent, so they sync at the same time.
      const sawRetryable = await Promise.all(
        (['dough', 'temps'] as const).map((target) => flushTarget(target, dates, opts)),
      );
      offline = sawRetryable.some(Boolean);
    } finally {
      inFlight = false;
      notify();
      if (rerunAfterFlight) {
        rerunAfterFlight = false;
        void flush();
      }
    }
  }

  function hasContent(entry: DateEntry): boolean {
    const formHas = (form: Record<string, string>) =>
      Object.values(form).some((v) => v.trim() !== '');
    if (entry.day && (formHas(entry.day.form) || entry.day.rounding !== null)) return true;
    if (entry.eon && formHas(entry.eon.form)) return true;
    if (entry.temps) {
      for (const slot of Object.values(entry.temps.readings)) {
        if (formHas(slot)) return true;
      }
    }
    return false;
  }

  return {
    getEntry,
    edit: edit as SyncEngine['edit'],

    isDirty(date) {
      const entry = getEntry(date);
      return (
        hasContent(entry) &&
        TYPE_ORDER.some((type) => {
          const rec = metaOf(entry, type);
          return !!rec && rec.updatedAt > rec.syncedAt;
        })
      );
    },

    applyFetched(date, apply) {
      if (this.isDirty(date)) return 'kept-dirty';
      const entry = getEntry(date);
      apply(entry);
      const now = deps.now();
      for (const type of TYPE_ORDER) {
        const rec = metaOf(entry, type);
        if (rec) {
          rec.updatedAt = now;
          rec.syncedAt = now; // fetched content is by definition what the sheet has
        }
      }
      persist(date);
      notify();
      return 'replaced';
    },

    overwrite(date, apply) {
      const entry = getEntry(date);
      apply(entry);
      const now = deps.now();
      for (const type of TYPE_ORDER) {
        const rec = metaOf(entry, type);
        if (rec) {
          rec.updatedAt = now;
          rec.syncedAt = now;
          rec.rejectedReason = null;
        }
      }
      persist(date);
      notify();
    },

    reset(date) {
      const now = deps.now();
      const entry: DateEntry = {
        day: { ...emptyDay(now), syncedAt: now },
        eon: { ...emptyEon(now), syncedAt: now },
        temps: { ...emptyTemps(now), syncedAt: now },
      };
      memory.set(date, entry);
      phoneFailed.delete(date);
      deps.clearEntry(date); // next load re-pulls the sheet
      notify();
    },

    editSeq(date) {
      return editSeqs.get(date) ?? 0;
    },

    flush,

    status(date): SyncStatus {
      const entry = getEntry(date);
      const rejected = TYPE_ORDER.map((t) => metaOf(entry, t)?.rejectedReason).find(
        (r) => r != null,
      );
      const dirty = this.isDirty(date);
      const failedPhone = phoneFailed.has(date);
      if (rejected) return { state: 'rejected', reason: rejected, phoneWriteFailed: failedPhone };
      if (dirty && failedPhone) {
        return { state: 'unsaved', reason: null, phoneWriteFailed: true };
      }
      if (!hasContent(entry)) return { state: 'new', reason: null, phoneWriteFailed: false };
      if (dirty && offline) return { state: 'offline', reason: null, phoneWriteFailed: failedPhone };
      if (dirty && inFlight) return { state: 'syncing', reason: null, phoneWriteFailed: failedPhone };
      if (dirty) return { state: 'saving', reason: null, phoneWriteFailed: failedPhone };
      return { state: 'synced', reason: null, phoneWriteFailed: failedPhone };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      // Boot retry: anything stored dirty from an earlier session goes out now.
      const dirtyExists = deps.listDates().some((date) => {
        const entry = getEntry(date);
        return TYPE_ORDER.some((type) => isDirtyRecord(metaOf(entry, type)));
      });
      if (dirtyExists) void flush();
    },
  };
}
