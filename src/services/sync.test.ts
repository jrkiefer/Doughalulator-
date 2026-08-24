import { describe, expect, it } from 'vitest';
import type { Outcome } from './client';
import type { DateEntry, DayEntry } from './local';
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
      // Like the real builder, the eon payload derives from the day record
      // too (its tomorrow-need feeds the EON check).
      const rec = entry[type];
      if (!rec) return null;
      if (type === 'eon') {
        const form = (rec as { form: Record<string, string> }).form;
        if (Object.values(form).every((v) => v === '')) return null;
        const day = entry.day as { form?: Record<string, string> } | undefined;
        return { type, date, body: form, need: day?.form?.tomorrowForecast ?? null };
      }
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
    post: (target, payload, o) => {
      posts.push({ target, payload, keepalive: o?.keepalive ?? false });
      return Promise.resolve(outcomes.shift() ?? { kind: 'ok', data: { ok: true } });
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
    /** The delays currently armed, so a backoff ladder can be read off directly. */
    timerDelays: () => timers.map((t) => t.ms),
  };
}

/** Let a flush chain run all the way out (more patient than a microtask or two). */
const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

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

  it('a direct flush (leaving a field, tapping a choice) cancels the pending debounce', async () => {
    const world = makeWorld();
    typeSales(world);
    expect(world.pendingTimers()).toBe(1);
    await world.engine.flush();
    expect(world.pendingTimers()).toBe(0); // no second, redundant flush later
    expect(world.posts).toHaveLength(1);
  });

  it('a keepalive flush leaves the debounce armed — the page may come back', async () => {
    const world = makeWorld();
    typeSales(world);
    expect(world.pendingTimers()).toBe(1);
    // Page backgrounded: fire-and-forget, nothing is marked synced…
    await world.engine.flush({ keepalive: true });
    expect(world.engine.status(D).state).toBe('saving');
    // …so the pending debounce must survive to confirm the save on return.
    expect(world.pendingTimers()).toBe(1);
    await world.fireTimers();
    expect(world.engine.status(D).state).toBe('synced');
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

describe('the retry ladder — "WILL RETRY" with a clock behind it', () => {
  const retryable: Outcome = { kind: 'retryable', error: 'timeout' };

  it('a failed send arms a retry, and firing it gets the numbers through', async () => {
    const world = makeWorld();
    world.setOutcomes([retryable]);
    typeSales(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('offline');
    expect(world.timerDelays()).toEqual([10_000]);

    await world.fireTimers();
    await settle();
    expect(world.posts).toHaveLength(2);
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('each failure waits twice as long, and the climb stops at five minutes', async () => {
    const world = makeWorld();
    world.setOutcomes(Array<Outcome>(9).fill(retryable));
    typeSales(world);
    await world.engine.flush();

    const ladder: number[] = [];
    for (let i = 0; i < 7; i++) {
      ladder.push(world.timerDelays()[0]!);
      await world.fireTimers();
      await settle();
    }
    expect(ladder).toEqual([10_000, 20_000, 40_000, 80_000, 160_000, 300_000, 300_000]);
  });

  it('a success stands the ladder down and starts it from the bottom next time', async () => {
    const world = makeWorld();
    world.setOutcomes([retryable]);
    typeSales(world);
    await world.engine.flush();
    expect(world.timerDelays()).toEqual([10_000]);

    // The retry lands (the queue is empty, so the fake network answers ok).
    await world.fireTimers();
    await settle();
    expect(world.pendingTimers()).toBe(0);

    // A later failure begins at 10s again rather than carrying on up.
    world.setOutcomes([retryable]);
    typeSales(world, '9.9');
    await world.engine.flush();
    expect(world.timerDelays()).toEqual([10_000]);
  });

  it('a sheet that REFUSED a save is never retried on a timer', async () => {
    const world = makeWorld();
    world.setOutcomes([{ kind: 'rejected', reason: 'unknown tab: Sheet2' }]);
    typeSales(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('rejected');
    expect(world.pendingTimers()).toBe(0); // retrying a refusal teaches nobody anything
  });

  it('a keepalive flush neither arms a retry nor cancels one already waiting', async () => {
    const world = makeWorld();
    world.setOutcomes([retryable]);
    typeSales(world);
    await world.engine.flush();
    expect(world.timerDelays()).toEqual([10_000]);

    // The page goes away mid-outage: it confirms nothing, so it must not
    // pretend the sheet answered and drop the pending attempt.
    await world.engine.flush({ keepalive: true });
    expect(world.timerDelays()).toEqual([10_000]);
  });
});

describe('the two sheets sync in parallel', () => {
  it('a dough network failure never blocks the temps sheet, and only dough retries', async () => {
    const world = makeWorld();
    world.setOutcomes([
      { kind: 'retryable', error: 'timeout' }, // dough (day)
      { kind: 'ok', data: {} }, // temps sails through regardless
    ]);
    typeSales(world);
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush();
    expect(world.posts.map((p) => p.target)).toEqual(['dough', 'temps']);
    expect(world.engine.status(D).state).toBe('offline'); // the day record is still dirty
    // The next trigger resends ONLY the dough side — temps is already done.
    await world.engine.flush();
    expect(world.posts.map((p) => p.target)).toEqual(['dough', 'temps', 'dough']);
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('an unreachable TEMP log never makes the dough log look broken', async () => {
    const world = makeWorld();
    const D2 = '2026-08-02';
    world.setOutcomes([
      { kind: 'ok', data: {} }, // the dough sheet is perfectly fine
      { kind: 'retryable', error: 'no sheet connected yet' }, // the temps one is not
    ]);
    typeSales(world); // a dough record on D
    world.engine.edit(D2, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush();
    expect(world.engine.status(D2).state).toBe('offline'); // that one really is waiting

    // A fresh dough edit is waiting on a sheet that answered fine a moment ago.
    typeSales(world, '9.9');
    expect(world.engine.status(D).state).toBe('saving');
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
    expect(world.posts[0]!.keepalive).toBe(true);
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

/** What a dough-sheet fetch speaks for — mirrors DOUGH_SHEET_RECORDS in src/app/engine.ts. */
const FROM_DOUGH_SHEET = ['day', 'eon'] as const;

/** A day record as a fetch would build it: whole, not a patch onto what's there. */
function fetchedDay(todayForecast: string): DayEntry {
  return {
    form: { todayForecast },
    rounding: null,
    bibleOverride: null,
    updatedAt: 0,
    syncedAt: 0,
    ackHash: null,
    rejectedReason: null,
  };
}

describe('two-phone merge (§4)', () => {
  it('a clean local record is replaced silently by the sheet copy', () => {
    const world = makeWorld();
    const result = world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
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
    const result = world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });
    expect(result).toBe('kept-dirty');
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('7.7');
  });

  it('a force-load CLEARS a record the sheet has no row for, instead of keeping it green', () => {
    // The trap: the fetch only writes back what the sheet actually holds, so
    // without clearing first, an EON the sheet never saw would survive on
    // screen AND be stamped synced — a green badge over numbers that are
    // nowhere but this phone.
    const world = makeWorld();
    world.engine.edit(D, 'eon', (rec) => {
      rec.form = { finalSales: '10.8' };
    });
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.night = { 'Walk-In': '36' };
    });

    // A sheet row with a 2 PM entry and no end-of-night entry.
    world.engine.overwrite(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });

    expect(world.engine.getEntry(D).eon).toBeUndefined();
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('8');
    // Temps come from the OTHER notebook — a dough fetch must not touch them.
    expect(world.engine.getEntry(D).temps!.readings.night['Walk-In']).toBe('36');
  });

  it('the background merge clears a stale record the same way', () => {
    const world = makeWorld();
    // Clean local EON (as if fetched earlier), then the sheet's row goes away.
    world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
      entry.eon = { form: { finalSales: '9' }, updatedAt: 0, syncedAt: 0, ackHash: null, rejectedReason: null };
    });
    expect(world.engine.getEntry(D).eon).toBeDefined();

    const result = world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });
    expect(result).toBe('replaced');
    expect(world.engine.getEntry(D).eon).toBeUndefined();
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
    world.engine.overwrite(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('8');
    expect(world.engine.isDirty(D)).toBe(false);
  });

  it('a dough force-load leaves a DIRTY temp reading dirty — never stamped synced', async () => {
    // The trap this pins: the sheet-truth stamp must touch ONLY the record
    // types the fetch replaces. Stamping every type once marked an unsent
    // temperature "synced" during a force-load — its retry stood down and the
    // reading would never have reached the Temp Log unless edited again.
    const world = makeWorld();
    world.setOutcomes([{ kind: 'retryable', error: 'temp log unreachable' }]);
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush(); // the temps notebook is down: still dirty
    expect(world.engine.recordStatus(D, 'temps').state).toBe('offline');

    world.engine.overwrite(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });
    // The reading survives AND is still owed to the sheet.
    expect(world.engine.getEntry(D).temps!.readings.morning['Pizza 1']).toBe('38');
    expect(world.engine.isDirty(D, ['temps'])).toBe(true);

    // The next flush really does deliver it (the fake network answers ok).
    await world.engine.flush();
    expect(world.posts.filter((p) => p.target === 'temps')).toHaveLength(2);
    expect(world.engine.recordStatus(D, 'temps').state).toBe('synced');
  });

  it('a dirty TEMP does not block the dough side from refreshing — different notebook', () => {
    // The background merge's dirty check is scoped to the types the fetch
    // replaces: the fetch does not touch temps, so a half-typed temperature
    // is no reason to keep a stale dough copy on screen.
    const world = makeWorld();
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    const result = world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
      entry.day = fetchedDay('8');
    });
    expect(result).toBe('replaced');
    expect(world.engine.getEntry(D).day!.form.todayForecast).toBe('8');
    // …while the temp reading stays exactly as typed, and stays dirty.
    expect(world.engine.getEntry(D).temps!.readings.morning['Pizza 1']).toBe('38');
    expect(world.engine.isDirty(D, ['temps'])).toBe(true);
  });

  it('a dirty DAY record still blocks the merge, exactly as before', () => {
    const world = makeWorld();
    typeSales(world, '7.7');
    expect(
      world.engine.applyFetched(D, FROM_DOUGH_SHEET, (entry) => {
        entry.day = fetchedDay('8');
      }),
    ).toBe('kept-dirty');
  });
});

describe('a rounding tap alone is content — both pills, symmetrically', () => {
  it('a forecast-rounding tap dirties the day record like a batch tap does', () => {
    // Each tap is a decision the other phone must see. The forecast pill was
    // once left out of the content check, so a tap-only day read as NEW and
    // never posted anywhere.
    const world = makeWorld();
    world.engine.edit(D, 'day', (rec) => {
      rec.forecastRound = 'down';
    });
    expect(world.engine.recordStatus(D, 'day').state).not.toBe('new');
    expect(world.engine.isDirty(D, ['day'])).toBe(true);
  });
});

describe('derived records resync — the new math is always saved', () => {
  function typeEon(world: ReturnType<typeof makeWorld>, value = '7.9') {
    world.engine.edit(D, 'eon', (rec) => {
      rec.form = { ...rec.form, finalSales: value };
    });
  }

  it('a 2 PM edit re-dirties the EON record so its recomputed check re-syncs', async () => {
    const world = makeWorld();
    world.engine.edit(D, 'day', (rec) => {
      rec.form = { ...rec.form, tomorrowForecast: '9.1' };
    });
    typeEon(world);
    await world.engine.flush();
    expect(world.posts.map((p) => (p.payload as { type: string }).type)).toEqual(['day', 'eon']);

    // Change ONLY the 2 PM tomorrow forecast — the EON check depends on it.
    world.engine.edit(D, 'day', (rec) => {
      rec.form = { ...rec.form, tomorrowForecast: '10.5' };
    });
    await world.engine.flush();
    const types = world.posts.map((p) => (p.payload as { type: string }).type);
    expect(types).toEqual(['day', 'eon', 'day', 'eon']);
    expect((world.posts[3]!.payload as { need: string }).need).toBe('10.5');
    expect(world.engine.status(D).state).toBe('synced');
  });

  it('a day edit never conjures an EON record that was never started', async () => {
    const world = makeWorld();
    typeSales(world);
    await world.engine.flush();
    expect(world.posts.map((p) => (p.payload as { type: string }).type)).toEqual(['day']);
  });

  it('a day edit clears a parked EON rejection so it retries with the new math', async () => {
    const world = makeWorld();
    world.setOutcomes([
      { kind: 'ok', data: {} }, // day
      { kind: 'rejected', reason: 'negative value where it makes no sense' }, // eon
    ]);
    world.engine.edit(D, 'day', (rec) => {
      rec.form = { ...rec.form, tomorrowForecast: '9.1' };
    });
    typeEon(world);
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('rejected');

    world.engine.edit(D, 'day', (rec) => {
      rec.form = { ...rec.form, tomorrowForecast: '12' };
    });
    await world.engine.flush();
    expect(world.posts.map((p) => (p.payload as { type: string }).type)).toEqual([
      'day', 'eon', 'day', 'eon',
    ]);
    expect(world.engine.status(D).state).toBe('synced');
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

describe('per-record status — a screen speaks only for what it edits', () => {
  it('a dough failure never makes a saved temp read as unsaved', async () => {
    const world = makeWorld();
    world.setOutcomes([
      { kind: 'retryable', error: 'timeout' }, // dough stays dirty
      { kind: 'ok', data: {} }, // temps saves fine
    ]);
    typeSales(world);
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush();
    expect(world.engine.status(D).state).toBe('offline'); // the date as a whole, honestly
    expect(world.engine.recordStatus(D, 'temps').state).toBe('synced');
    expect(world.engine.recordStatus(D, 'day').state).toBe('offline');
  });

  it('typing a temp dirties the temps record alone', () => {
    const world = makeWorld();
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    expect(world.engine.recordStatus(D, 'temps').state).toBe('saving');
    expect(world.engine.recordStatus(D, 'day').state).toBe('new');
  });

  it('a temps rejection parks its reason on the temps record only', async () => {
    const world = makeWorld();
    world.setOutcomes([{ kind: 'rejected', reason: 'unknown slot' }]);
    world.engine.edit(D, 'temps', (rec) => {
      rec.readings.morning['Pizza 1'] = '38';
    });
    await world.engine.flush();
    expect(world.engine.recordStatus(D, 'temps')).toMatchObject({
      state: 'rejected',
      reason: 'unknown slot',
    });
    expect(world.engine.recordStatus(D, 'day').state).toBe('new');
  });
});
