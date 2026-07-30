import { describe, expect, it } from 'vitest';
import type { Outcome } from './client';
import type { DateEntry } from './local';
import { createSyncEngine, type RecordType, type SyncDeps } from './sync';

/**
 * A fully faked world: storage is a Map (optionally "full"), the network is a
 * scripted queue of outcomes, timers fire only when the test says so.
 */
function makeWorld(opts: { debounceMs?: number } = {}) {
  const store = new Map<string, DateEntry>();
  let phoneFull = false;
  let clock = 1000;
  const posts: { target: string; payload: object; keepalive: boolean }[] = [];
  let outcomes: Outcome[] = [];
  const timers: { fn: () => void; ms: number; id: number }[] = [];
  let timerId = 0;

  const deps: SyncDeps = {
    now: () => ++clock,
    loadEntry: (date) => {
      const hit = store.get(date);
      return hit ? (JSON.parse(JSON.stringify(hit)) as DateEntry) : null;
    },
    saveEntry: (date, entry) => {
      if (phoneFull) return false;
      store.set(date, JSON.parse(JSON.stringify(entry)) as DateEntry);
      return true;
    },
    clearEntry: (date) => void store.delete(date),
    listDates: () => [...store.keys()],
    buildPayload: (type: RecordType, date, entry) => {
      // Trivial builder: send the record's form-ish content; null when empty.
      const rec = entry[type];
      if (!rec) return null;
      const body =
        type === 'temps'
          ? (rec as { readings: object }).readings
          : (rec as { form: Record<string, string> }).form;
      if (JSON.stringify(body).length <= 2 || Object.values(body).every((v) => v === '')) {
        if (type !== 'temps') return null;
      }
      if (type === 'temps') {
        const slots = Object.values(body as Record<string, Record<string, string>>);
        if (!slots.some((s) => Object.values(s).some((v) => v !== ''))) return null;
      }
      return { type, date, body };
    },
    post: async (target, payload, o) => {
      posts.push({ target, payload, keepalive: o?.keepalive ?? false });
      return outcomes.shift() ?? { kind: 'ok', data: { ok: true } };
    },
    setTimer: (fn, ms) => {
      timers.push({ fn, ms, id: ++timerId });
      return timerId as unknown as ReturnType<typeof setTimeout>;
    },
    clearTimer: (id) => {
      const idx = timers.findIndex((t) => t.id === (id as unknown as number));
      if (idx >= 0) timers.splice(idx, 1);
    },
  };

  return {
    deps,
    store,
    posts,
    engine: createSyncEngine(deps, opts.debounceMs ?? 2500),
    setOutcomes: (list: Outcome[]) => (outcomes = list),
    setPhoneFull: (v: boolean) => (phoneFull = v),
    fireTimers: async () => {
      const pending = timers.splice(0);
      for (const t of pending) t.fn();
      await Promise.resolve();
      await Promise.resolve();
    },
    pendingTimers: () => timers.length,
  };
}

const D = '2026-08-01';

function typeSales(world: ReturnType<typeof makeWorld>, value = '9.5') {
  world.engine.edit(D, 'day', (rec) => {
    rec.form = { ...rec.form, todayForecast: value };
  });
}

describe('autosave to the phone (§3a)', () => {
  it('every keystroke persists the record immediately with a fresh updated-at', () => {
    const world = makeWorld();
    typeSales(world);
    const stored = world.store.get(D)!;
    expect(stored.day!.form.todayForecast).toBe('9.5');
    expect(stored.day!.updatedAt).toBeGreaterThan(stored.day!.syncedAt);
  });

  it('a storage failure cannot crash an edit — the record lives on in memory', () => {
    const world = makeWorld();
    world.setPhoneFull(true);
    expect(() => typeSales(world)).not.toThrow();
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('9.5');
  });
});

describe('debounced background sync (§3b)', () => {
  it('edits schedule one trailing debounce; the flush posts once', async () => {
    const world = makeWorld();
    typeSales(world, '9');
    typeSales(world, '9.5');
    typeSales(world, '9.55');
    expect(world.pendingTimers()).toBe(1); // trailing debounce, not three timers
    await world.fireTimers();
    expect(world.posts).toHaveLength(1);
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('identical content is never resent (per-type ack hash)', async () => {
    const world = makeWorld();
    typeSales(world);
    await world.engine.flush();
    expect(world.posts).toHaveLength(1);
    // Re-edit to the exact same content → dirty again, but the payload hash matches.
    typeSales(world);
    await world.engine.flush();
    expect(world.posts).toHaveLength(1); // no second post
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('an empty record is never posted', async () => {
    const world = makeWorld();
    world.engine.edit(D, 'day', (rec) => {
      rec.form = { todayForecast: '' };
    });
    await world.engine.flush();
    expect(world.posts).toHaveLength(0);
  });

  it('single-flight: a flush during a flush schedules exactly one rerun', async () => {
    const world = makeWorld();
    typeSales(world);
    const first = world.engine.flush();
    const second = world.engine.flush(); // overlaps
    await Promise.all([first, second]);
    await Promise.resolve();
    expect(world.posts).toHaveLength(1); // rerun found nothing new to send
  });
});

describe('"sheet said no" vs "no internet" (§3d)', () => {
  it('a retryable failure keeps the record dirty and reports offline', async () => {
    const world = makeWorld();
    world.setOutcomes([{ kind: 'retryable', error: 'timeout' }]);
    typeSales(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('offline');
    // Reconnect trigger → resend works.
    await world.engine.flush();
    expect(world.posts).toHaveLength(2);
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('a terminal rejection parks that record red WITHOUT blocking other types', async () => {
    const world = makeWorld();
    world.setOutcomes([
      { kind: 'rejected', reason: 'bad secret' }, // day
      { kind: 'ok', data: {} }, // temps still goes through
    ]);
    typeSales(world);
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush();
    const status = world.engine.status(D);
    expect(status.state).toBe('rejected');
    expect(status.reason).toBe('bad secret');
    // The temps post was not blocked by the dough rejection.
    expect(world.posts.map((p) => p.target)).toEqual(['dough', 'temps']);
    // A rejected record does not retry forever on its own…
    await world.engine.flush();
    expect(world.posts).toHaveLength(2);
    // …but the next edit clears the rejection and tries again.
    typeSales(world, '10');
    await world.engine.flush();
    expect(world.posts).toHaveLength(3);
    expect(world.engine.status(D).state).toBe('synced');
  });
});

describe('phone-storage failure path (§3e)', () => {
  it('phone full but sheet reachable → synced with the informational flag', async () => {
    const world = makeWorld();
    world.setPhoneFull(true);
    typeSales(world);
    await world.engine.flush();
    const status = world.engine.status(D);
    expect(status.state).toBe('synced');
    expect(status.phoneWriteFailed).toBe(true);
  });

  it('phone full AND sheet unreachable → the loud "not saved anywhere" flag', async () => {
    const world = makeWorld();
    world.setPhoneFull(true);
    world.setOutcomes([{ kind: 'retryable', error: 'offline' }]);
    typeSales(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('unsaved');
  });

  it('the flag clears the moment either store succeeds', async () => {
    const world = makeWorld();
    world.setPhoneFull(true);
    world.setOutcomes([{ kind: 'retryable', error: 'offline' }]);
    typeSales(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('unsaved');
    // Phone frees up; the next edit persists.
    world.setPhoneFull(false);
    typeSales(world, '9.6');
    expect(world.engine.status(D).state).not.toBe('unsaved');
  });
});

describe('page-hide keepalive (§3c)', () => {
  it('fires and forgets — never marked synced on the client', async () => {
    const world = makeWorld();
    typeSales(world);
    await world.engine.flush({ keepalive: true });
    expect(world.posts).toHaveLength(1);
    expect(world.posts[0].keepalive).toBe(true);
    // Still dirty: if the keepalive died with the page, the boot retry has it.
    expect(world.engine.status(D).state).toBe('saving');
  });
});

describe('boot retry (§3c-4)', () => {
  it('start() resends any stored record whose updated-at beats its synced-at', async () => {
    const world = makeWorld();
    typeSales(world); // persisted dirty, but we never flush…
    const rebooted = createSyncEngine(world.deps, 2500);
    rebooted.start();
    await Promise.resolve();
    await Promise.resolve();
    expect(world.posts).toHaveLength(1);
  });
});

describe('two-phone merge (§4)', () => {
  it('a clean local record is replaced silently by the sheet copy', () => {
    const world = makeWorld();
    const result = world.engine.applyFetched(D, (entry) => {
      entry.day = {
        form: { todayForecast: '8' },
        rounding: null,
        bibleOverride: null,
        updatedAt: 0,
        syncedAt: 0,
        ackHash: null,
        rejectedReason: null,
      };
    });
    expect(result).toBe('replaced');
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('8');
    expect(world.engine.isDirty(D)).toBe(false); // fetched = what the sheet has
  });

  it('a dirty local record wins and is not overwritten', () => {
    const world = makeWorld();
    typeSales(world, '7.7');
    const result = world.engine.applyFetched(D, (entry) => {
      entry.day!.form.todayForecast = '8';
    });
    expect(result).toBe('kept-dirty');
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('7.7');
  });

  it('the keystroke guard has a per-date edit sequence to detect mid-fetch typing', () => {
    const world = makeWorld();
    const before = world.engine.editSeq(D);
    typeSales(world);
    expect(world.engine.editSeq(D)).toBe(before + 1);
  });

  it('overwrite (confirmed force-load) replaces even dirty content and marks it clean', () => {
    const world = makeWorld();
    typeSales(world, '7.7');
    world.engine.overwrite(D, (entry) => {
      entry.day!.form.todayForecast = '8';
    });
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('8');
    expect(world.engine.isDirty(D)).toBe(false);
  });
});

describe('reset (§4)', () => {
  it('blanks only the date, clears its cache entry, and never posts the empty record', async () => {
    const world = makeWorld();
    typeSales(world);
    await world.engine.flush();
    world.engine.reset(D);
    expect(world.store.has(D)).toBe(false); // cache cleared → next load re-pulls the sheet
    expect(world.engine.status(D).state).toBe('new');
    await world.engine.flush();
    expect(world.posts).toHaveLength(1); // nothing new went out
  });
});
