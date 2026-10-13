import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultConfig, type BibleId } from '../config';
import { selectBibleId, slotForTime, type TempSlot } from '../core';
import { EonPage } from '../features/eon/EonPage';
import { emptyEonForm, type EonForm } from '../features/eon/formState';
import { ActiveDate } from '../features/shell/ActiveDate';
import { BibleToggle } from '../features/shell/BibleToggle';
import { Footer } from '../features/shell/Footer';
import { Header } from '../features/shell/Header';
import { ModeNav, type Mode } from '../features/shell/ModeNav';
import { emptyTempReadings, TempsPage, type TempReadings } from '../features/temps/TempsPage';
import type { Rounding } from '../features/twoPm/DaysWork';
import { emptyTwoPmForm, type TwoPmForm } from '../features/twoPm/formState';
import { TwoPmPage } from '../features/twoPm/TwoPmPage';
import { addDays, fetchDate } from '../services/doughService';
import { KEEP_DAYS, pruneOldDates, sweepStaleKeys, type DateEntry } from '../services/local';
import { applyFetchedToEntry, buildDayRecord, DOUGH_SHEET_RECORDS, engine, mirrorBibles } from './engine';

const cfg = defaultConfig;

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function nowHhMm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/**
 * The calendar day the KITCHEN is on: before `smallHours.before` (05:00) it is
 * still last night, because a close finished after midnight belongs to the
 * evening that just ended.
 */
function workingDay(): string {
  return nowHhMm() < cfg.smallHours.before ? addDays(todayIso(), -1) : todayIso();
}

function inPeachWindow(date: string): boolean {
  const md = date.slice(5);
  return md >= cfg.peachSeason.start && md <= cfg.peachSeason.end;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('2pm');
  const [date, setDate] = useState(todayIso());
  const [form, setForm] = useState<TwoPmForm>(emptyTwoPmForm);
  const [rounding, setRounding] = useState<Rounding>(null);
  const [forecastRound, setForecastRound] = useState<Rounding>(null);
  const [bibleOverride, setBibleOverride] = useState<BibleId | undefined>(undefined);
  const [eonForm, setEonForm] = useState<EonForm>(emptyEonForm);
  const [tempSlot, setTempSlot] = useState<TempSlot>(() => slotForTime(nowHhMm(), cfg));
  const [temps, setTemps] = useState<TempReadings>(emptyTempReadings);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadArmed, setLoadArmed] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const [, setTick] = useState(0);
  // The date on screen right now, for async work that must not land its
  // answer on a different date from the one it started on.
  const activeDate = useRef(date);
  // What the CLOCK last said, so coming back to the app moves only what the
  // clock itself put there — never a slot or date chosen by hand. The dates
  // are a list because in the small hours the clock vouches for two: the
  // calendar day the app opens on AND last night, the one a close belongs to.
  const clockSlot = useRef<TempSlot | null>(null);
  const clockDays = useRef<string[]>([]);

  const rehydrate = useCallback((forDate: string) => {
    const entry = engine.getEntry(forDate);
    setForm({ ...emptyTwoPmForm, ...(entry.day?.form ?? {}) });
    setRounding(entry.day?.rounding ?? null);
    setForecastRound(entry.day?.forecastRound ?? null);
    setBibleOverride(entry.day?.bibleOverride ?? undefined);
    setEonForm({ ...emptyEonForm, ...(entry.eon?.form ?? {}) });
    setTemps(entry.temps?.readings ?? emptyTempReadings);
  }, []);

  // Date navigation paints the phone copy instantly — adjusted during render,
  // the React-sanctioned pattern for state derived from a changed input.
  if (hydratedFor !== date) {
    setHydratedFor(date);
    rehydrate(date);
    setLoadMsg('');
    setLoadArmed(false);
  }

  useEffect(() => {
    activeDate.current = date;
  }, [date]);

  // Boot: sweep pre-rename caches, forget long-finished dates, resend anything
  // dirty, wire the retry triggers.
  useEffect(() => {
    clockSlot.current = slotForTime(nowHhMm(), cfg);
    clockDays.current = [todayIso(), workingDay()];
    sweepStaleKeys();
    pruneOldDates(addDays(todayIso(), -KEEP_DAYS));
    engine.start();
    mirrorBibles();
    const unsubscribe = engine.subscribe(() => setTick((t) => t + 1));
    const onOnline = () => void engine.flush();
    // Leaving a FIELD syncs right away instead of waiting out the debounce.
    // Scoped to inputs: blurring a button or a card header has nothing to send.
    const onFocusOut = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement) void engine.flush();
    };
    // Coming back is when the clock may have moved under a phone that kept the
    // app in memory: reopened at 2 PM still on the Morning slot (2 PM readings
    // would overwrite the morning's), or the next afternoon still on
    // yesterday's date. Both are re-asked of the clock — but only what the
    // clock put there moves (owner's choice, Oct 2026): a slot tapped by hand
    // in the same period stays, and a date picked on purpose stays.
    const onReturn = () => {
      // The small hours touch NOTHING. The working day is still last night, so
      // the date must not move; and the slot must not either, or 12:30 AM
      // readings would land in last night's MORNING column (the clock says
      // "before 11:00"). Not even the remembered values move — a phone woken
      // at 1 AM must still know, that afternoon, what the clock last put there.
      if (nowHhMm() < cfg.smallHours.before) return;
      const slot = slotForTime(nowHhMm(), cfg);
      if (slot !== clockSlot.current) {
        clockSlot.current = slot;
        setTempSlot(slot);
      }
      const day = todayIso();
      const vouched = clockDays.current;
      clockDays.current = [day];
      setDate((d) => (d !== day && vouched.includes(d) ? day : d));
    };
    // Leaving fires and forgets; coming BACK is the likeliest moment of all for
    // the signal to have returned, so it gets a real flush that can confirm.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        void engine.flush({ keepalive: true });
      } else {
        onReturn();
        void engine.flush();
      }
    };
    const onPageHide = () => void engine.flush({ keepalive: true });
    window.addEventListener('online', onOnline);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [rehydrate]);

  // Behind the instant paint, fetch the date from the sheet and merge.
  // Short delay first: stepping through days with ◀ ▶ should fetch the day the
  // owner lands on, not every day they pass through.
  useEffect(() => {
    let alive = true;
    const seqBefore = engine.changeSeq(date);
    const timer = setTimeout(() => {
      void fetchDate(date).then((result) => {
        if (!alive || result.kind !== 'loaded') return;
        // Stale guard: typing during the fetch, OR a save confirmed during it,
        // discards the fetched record. The second matters as much as the
        // first — the sheet may have answered from BEFORE a save that was
        // already in flight, and once that save confirmed, the record looked
        // clean and the older sheet copy replaced the newer numbers.
        if (engine.changeSeq(date) !== seqBefore) return;
        const applied = engine.applyFetched(date, DOUGH_SHEET_RECORDS, (entry) =>
          applyFetchedToEntry(entry, result.day, date),
        );
        if (applied === 'replaced') rehydrate(date);
        else setLoadMsg('Phone copy kept — tap LOAD FROM SHEET to pull the sheet.');
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [date, rehydrate]);

  const record = useMemo(
    () => buildDayRecord(date, form, rounding, bibleOverride, forecastRound),
    [date, form, rounding, bibleOverride, forecastRound],
  );
  const status = engine.status(date);
  // Each page's "saved" tags speak for the record that page edits — never the
  // whole date's, or a busy temp side would make saved dough look unsaved.
  const daySaved = engine.recordStatus(date, 'day').state === 'synced';
  const eonSaved = engine.recordStatus(date, 'eon').state === 'synced';
  const activeBible = bibleOverride ?? selectBibleId(date, cfg);

  // Just after midnight the calendar has already turned but the SHIFT hasn't:
  // an end-of-night count finished at 12:30 AM belongs to the evening that
  // just ended — yesterday's date. The app never switches dates by itself
  // (guessing which night is meant would be worse than either answer), so it
  // says this out loud on the date card until the small hours pass. Checked
  // per render: a keystroke or tap is what would bring someone here at that
  // hour, so the hint appears exactly when it can matter.
  const pastMidnight = date === todayIso() && nowHhMm() < cfg.smallHours.before;

  // ————— edits: React state + engine, in lockstep —————

  function editDay(patch: Partial<TwoPmForm>) {
    setForm((f) => ({ ...f, ...patch }));
    engine.edit(date, 'day', (rec) => {
      rec.form = { ...emptyTwoPmForm, ...rec.form, ...patch };
    });
  }

  // A rounding tap is a finished decision — it goes at once, no debounce wait.
  // Tapping the pill already in force hands the night back to the auto rule.
  function editRounding(r: 'down' | 'up') {
    const next = rounding === r ? null : r;
    setRounding(next);
    engine.edit(date, 'day', (rec) => {
      rec.rounding = next;
    });
    void engine.flush();
  }

  function editForecastRound(r: 'down' | 'up') {
    // Tapping the pill that is already in force hands the night back to auto.
    const next = forecastRound === r ? null : r;
    setForecastRound(next);
    engine.edit(date, 'day', (rec) => {
      rec.forecastRound = next;
    });
    void engine.flush();
  }

  function editBible(id: BibleId) {
    setBibleOverride(id);
    engine.edit(date, 'day', (rec) => {
      rec.bibleOverride = id;
    });
    void engine.flush();
  }

  function editEon(patch: Partial<EonForm>) {
    setEonForm((f) => ({ ...f, ...patch }));
    engine.edit(date, 'eon', (rec) => {
      rec.form = { ...emptyEonForm, ...rec.form, ...patch };
    });
  }

  function editTemp(slot: TempSlot, station: string, value: string) {
    setTemps((t) => ({ ...t, [slot]: { ...t[slot], [station]: value } }));
    const time = nowHhMm();
    engine.edit(date, 'temps', (rec) => {
      rec.readings[slot] = { ...rec.readings[slot], [station]: value };
      rec.times = { ...rec.times, [slot]: time };
    });
  }

  // ————— load / reset —————

  async function handleLoad() {
    // The confirmation warns only about edits this load would actually
    // replace: LOAD FROM SHEET pulls the DOUGH notebook, so a half-typed
    // temperature (the other notebook) is no reason to arm the warning.
    if (engine.isDirty(date, DOUGH_SHEET_RECORDS) && !loadArmed) {
      setLoadArmed(true);
      setLoadMsg('This will replace unsynced edits — tap again to confirm.');
      return;
    }
    setLoadArmed(false);
    setLoadMsg('Loading…');
    const seq = engine.changeSeq(date);
    const result = await fetchDate(date);
    // The owner moved to another date while this loaded: its answer belongs to
    // a date no longer on screen, so it must not be painted there.
    if (activeDate.current !== date) return;
    // A save confirmed (or a number was typed) while it loaded: the answer may
    // predate it, and applying it would put older numbers back.
    if (engine.changeSeq(date) !== seq) {
      return setLoadMsg('Something changed while loading — tap LOAD FROM SHEET again.');
    }
    if (result.kind === 'empty') return setLoadMsg('The sheet has no row for this date.');
    if (result.kind === 'unreachable') return setLoadMsg("Can't reach the sheet — check your connection.");
    if (result.kind === 'rejected') return setLoadMsg(`Sheet said no: ${result.reason}`);

    // "Up to date" must compare EVERYTHING the fetch can change, or a
    // difference gets reported as sameness and never pulled. The forecast
    // rounding was once missing from this list, so a tap made on the other
    // phone could not be loaded — the two phones then resolved the same
    // night in opposite directions.
    const probe: DateEntry = {};
    applyFetchedToEntry(probe, result.day, date);
    const same =
      JSON.stringify({
        form: { ...emptyTwoPmForm, ...(probe.day?.form ?? {}) },
        rounding: probe.day?.rounding ?? null,
        forecastRound: probe.day?.forecastRound ?? null,
        bible: probe.day?.bibleOverride ?? null,
        eon: { ...emptyEonForm, ...(probe.eon?.form ?? {}) },
      }) ===
      JSON.stringify({ form, rounding, forecastRound, bible: bibleOverride ?? null, eon: eonForm });
    if (same) return setLoadMsg('Up to date ✓');

    engine.overwrite(date, DOUGH_SHEET_RECORDS, (entry) => applyFetchedToEntry(entry, result.day, date));
    rehydrate(date);
    setLoadMsg('Loaded from the sheet ✓');
  }

  function handleReset() {
    if (!resetArmed) {
      setResetArmed(true);
      setTimeout(() => setResetArmed(false), 4000);
      return;
    }
    setResetArmed(false);
    engine.reset(date);
    rehydrate(date);
    setLoadMsg('');
  }

  return (
    <div className="page">
      <div className="band">
        <Header status={status} resetArmed={resetArmed} onReset={handleReset} />
        <ActiveDate
          date={date}
          onChange={setDate}
          onLoad={() => void handleLoad()}
          loadArmed={loadArmed}
          loadMsg={loadMsg}
          pastMidnight={pastMidnight}
        />
        {mode !== 'temps' && inPeachWindow(date) && (
          <BibleToggle
            active={activeBible}
            isAuto={bibleOverride === undefined}
            onOverride={editBible}
          />
        )}
        <ModeNav mode={mode} onChange={setMode} />
      </div>

      {/* Each tab's feature folder owns its WHOLE page, top to bottom —
          App only decides which one is showing. */}
      {mode === '2pm' && (
        <TwoPmPage
          record={record}
          form={form}
          onFormChange={editDay}
          onRounding={editRounding}
          onForecastRound={editForecastRound}
          onPickDate={setDate}
          synced={daySaved}
        />
      )}
      {mode === 'eon' && (
        <EonPage
          date={date}
          bibleOverride={bibleOverride}
          dayRecord={record}
          form={eonForm}
          onFormChange={editEon}
          onForecastRound={editForecastRound}
          onPickDate={setDate}
          synced={eonSaved}
        />
      )}
      {mode === 'temps' && (
        <TempsPage
          slot={tempSlot}
          onSlot={setTempSlot}
          readings={temps}
          onReading={editTemp}
          state={engine.recordStatus(date, 'temps').state}
        />
      )}
      <Footer />
    </div>
  );
}
