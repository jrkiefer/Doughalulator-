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
/** Which notebook a record belongs to. The two are independent end to end. */
export type SyncTarget = 'dough' | 'temps';
const TYPE_ORDER: RecordType[] = ['day', 'eon', 'temps'];
const TARGET_OF: Record<RecordType, SyncTarget> = {
  day: 'dough',
  eon: 'dough',
  temps: 'temps',
};
const TARGETS: readonly SyncTarget[] = ['dough', 'temps'];

/**
 * The retry ladder. Every other trigger is a tap, a keystroke, or the browser
 * announcing something — so before this, a sheet that was merely SLOW left the
 * record dirty under a pill promising a retry that nothing would ever start.
 * Each failure waits twice as long as the last, and the climb stops at five
 * minutes: 10s, 20s, 40s, 80s, 160s, then 300s for as long as it takes.
 */
const RETRY_BASE_MS = 10_000;
const RETRY_MAX_MS = 300_000;
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
    target: SyncTarget,
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
  /**
   * Replace a date's entry from a sheet fetch — only where the local copy is
   * clean. `replaces` names the record types this fetch speaks for: they are
   * cleared first, so a type the sheet has no row for ends up genuinely empty
   * instead of keeping a stale local copy. Types not listed (temps, which come
   * from the other notebook) are left alone.
   */
  applyFetched(
    date: string,
    replaces: readonly RecordType[],
    apply: (entry: DateEntry) => void,
  ): 'replaced' | 'kept-dirty';
  /** True when any of the date's records has unsynced typed content. */
  isDirty(date: string): boolean;
  /** Force-load path: overwrite local with fetched content and mark clean. */
  overwrite(date: string, replaces: readonly RecordType[], apply: (entry: DateEntry) => void): void;
  /** Two-tap reset target: blank the date and make sure nothing ever posts. */
  reset(date: string): void;
  /** Note that an edit landed while a fetch was in flight (keystroke guard §4). */
  editSeq(date: string): number;
  flush(opts?: { keepalive?: boolean }): Promise<void>;
  status(date: string): SyncStatus;
  /**
   * One record's own state, so a screen can speak for exactly what it edits —
   * the temps page must not read "saving" because the DOUGH side is behind.
   */
  recordStatus(date: string, type: RecordType): SyncStatus;
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
  /** The sheets whose last attempt hit a network-class failure — per notebook,
   * so an unreachable temp log can never make the dough log look broken. */
  const offlineTargets = new Set<SyncTarget>();
  let inFlight = false;
  let rerunAfterFlight = false;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let retryAttempt = 0;
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

  /** Arm the next attempt after a network-class failure, backing off each time. */
  function scheduleRetry() {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    const delay = Math.min(RETRY_BASE_MS * 2 ** retryAttempt, RETRY_MAX_MS);
    retryAttempt++;
    retryTimer = deps.setTimer(() => {
      retryTimer = null;
      void flush();
    }, delay);
  }

  /** A sheet answered: stand the ladder down, and start from the bottom next time. */
  function clearRetry() {
    if (retryTimer !== null) deps.clearTimer(retryTimer);
    retryTimer = null;
    retryAttempt = 0;
  }

  function isDirtyRecord(rec: SyncMeta | undefined): boolean {
    return !!rec && rec.updatedAt > rec.syncedAt && rec.rejectedReason === null;
  }

  /** Which sheets a date is still waiting on. */
  function dirtyTargets(entry: DateEntry): SyncTarget[] {
    const targets = new Set<SyncTarget>();
    for (const type of TYPE_ORDER) {
      const rec = metaOf(entry, type);
      if (rec && rec.updatedAt > rec.syncedAt) targets.add(TARGET_OF[type]);
    }
    return [...targets];
  }

  /**
   * Take a sheet fetch as the truth for the record types it speaks for.
   *
   * Clearing those types FIRST is the whole point: the fetch only writes back
   * the ones the sheet actually has a row for, so without this a record the
   * sheet doesn't hold would survive on screen and then get stamped synced —
   * a green badge over numbers the sheet has never seen.
   */
  function takeFromSheet(
    date: string,
    replaces: readonly RecordType[],
    apply: (entry: DateEntry) => void,
  ): void {
    const entry = getEntry(date);
    for (const type of replaces) delete entry[type];
    apply(entry);
    const now = deps.now();
    for (const type of TYPE_ORDER) {
      const rec = metaOf(entry, type);
      if (rec) {
        rec.updatedAt = now;
        rec.syncedAt = now; // fetched content is by definition what the sheet has
        rec.rejectedReason = null;
      }
    }
    persist(date);
    notify();
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
        TARGETS.map((target) => flushTarget(target, dates, opts)),
      );
      // A keepalive flush confirms NOTHING — it fires into a page that is going
      // away and never hears back. So it must not claim a sheet is reachable,
      // and must not stand down a retry that is already waiting its turn.
      if (!opts.keepalive) {
        TARGETS.forEach((target, i) => {
          if (sawRetryable[i]) offlineTargets.add(target);
          else offlineTargets.delete(target);
        });
        if (offlineTargets.size > 0) scheduleRetry();
        else clearRetry();
      }
    } finally {
      inFlight = false;
      notify();
      if (rerunAfterFlight) {
        rerunAfterFlight = false;
        void flush();
      }
    }
  }

  const formHas = (form: Record<string, string>) =>
    Object.values(form).some((v) => v.trim() !== '');

  function recordHasContent(entry: DateEntry, type: RecordType): boolean {
    if (type === 'day') return !!entry.day && (formHas(entry.day.form) || entry.day.rounding !== null);
    if (type === 'eon') return !!entry.eon && formHas(entry.eon.form);
    return !!entry.temps && Object.values(entry.temps.readings).some(formHas);
  }

  function hasContent(entry: DateEntry): boolean {
    return TYPE_ORDER.some((type) => recordHasContent(entry, type));
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

    applyFetched(date, replaces, apply) {
      if (this.isDirty(date)) return 'kept-dirty';
      takeFromSheet(date, replaces, apply);
      return 'replaced';
    },

    overwrite(date, replaces, apply) {
      takeFromSheet(date, replaces, apply);
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
      const waitingOnOffline = dirtyTargets(entry).some((t) => offlineTargets.has(t));
      if (dirty && waitingOnOffline) {
        return { state: 'offline', reason: null, phoneWriteFailed: failedPhone };
      }
      if (dirty && inFlight) return { state: 'syncing', reason: null, phoneWriteFailed: failedPhone };
      if (dirty) return { state: 'saving', reason: null, phoneWriteFailed: failedPhone };
      return { state: 'synced', reason: null, phoneWriteFailed: failedPhone };
    },

    recordStatus(date, type): SyncStatus {
      const entry = getEntry(date);
      const rec = metaOf(entry, type);
      const failedPhone = phoneFailed.has(date);
      const rejected = rec?.rejectedReason ?? null;
      if (rejected) return { state: 'rejected', reason: rejected, phoneWriteFailed: failedPhone };
      const content = recordHasContent(entry, type);
      const dirty = !!rec && rec.updatedAt > rec.syncedAt && content;
      if (dirty && failedPhone) return { state: 'unsaved', reason: null, phoneWriteFailed: true };
      if (!content) return { state: 'new', reason: null, phoneWriteFailed: false };
      if (dirty && offlineTargets.has(TARGET_OF[type])) {
        return { state: 'offline', reason: null, phoneWriteFailed: failedPhone };
      }
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
