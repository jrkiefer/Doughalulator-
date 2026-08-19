import { useCallback, useEffect, useMemo, useState } from 'react';
import { defaultConfig, type BibleId } from '../config';
import { selectBibleId, slotForTime, type TempSlot } from '../core';
import { bibles } from '../data/bibles';
import { BibleViewer } from '../features/bibleViewer/BibleViewer';
import { EonPage } from '../features/eon/EonPage';
import { emptyEonForm, type EonForm } from '../features/eon/formState';
import { GraphsCard } from '../features/graphs/GraphsCard';
import { HistoryCard } from '../features/history/HistoryCard';
import { ActiveDate } from '../features/shell/ActiveDate';
import { BibleToggle } from '../features/shell/BibleToggle';
import { Footer } from '../features/shell/Footer';
import { Header } from '../features/shell/Header';
import { ModeNav, type Mode } from '../features/shell/ModeNav';
import { TempGraph } from '../features/temps/TempGraph';
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

  // Boot: sweep pre-rename caches, forget long-finished dates, resend anything
  // dirty, wire the retry triggers.
  useEffect(() => {
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
    // Leaving fires and forgets; coming BACK is the likeliest moment of all for
    // the signal to have returned, so it gets a real flush that can confirm.
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void engine.flush({ keepalive: true });
      else void engine.flush();
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
    const seqBefore = engine.editSeq(date);
    const timer = setTimeout(() => {
      fetchDate(date).then((result) => {
        if (!alive || result.kind !== 'loaded') return;
        // Keystroke guard: typing during the fetch discards the fetched record.
        if (engine.editSeq(date) !== seqBefore) return;
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
  const synced = status.state === 'synced';
  const activeBible = bibleOverride ?? selectBibleId(date, cfg);

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
    if (engine.isDirty(date) && !loadArmed) {
      setLoadArmed(true);
      setLoadMsg('This will replace unsynced edits — tap again to confirm.');
      return;
    }
    setLoadArmed(false);
    setLoadMsg('Loading…');
    const result = await fetchDate(date);
    if (result.kind === 'empty') return setLoadMsg('The sheet has no row for this date.');
    if (result.kind === 'unreachable') return setLoadMsg("Can't reach the sheet — check your connection.");
    if (result.kind === 'rejected') return setLoadMsg(`Sheet said no: ${result.reason}`);

    const probe: DateEntry = {};
    applyFetchedToEntry(probe, result.day, date);
    const same =
      JSON.stringify({
        form: { ...emptyTwoPmForm, ...(probe.day?.form ?? {}) },
        rounding: probe.day?.rounding ?? null,
        bible: probe.day?.bibleOverride ?? null,
        eon: { ...emptyEonForm, ...(probe.eon?.form ?? {}) },
      }) ===
      JSON.stringify({ form, rounding, bible: bibleOverride ?? null, eon: eonForm });
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
          onLoad={handleLoad}
          loadArmed={loadArmed}
          loadMsg={loadMsg}
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

      {mode === '2pm' && (
        <TwoPmPage
          record={record}
          form={form}
          onFormChange={editDay}
          onRounding={editRounding}
          onForecastRound={editForecastRound}
          synced={synced}
        />
      )}
      {mode === 'eon' && (
        <EonPage
          date={date}
          bibleOverride={bibleOverride}
          dayRecord={record}
          form={eonForm}
          onFormChange={editEon}
          synced={synced}
        />
      )}
      {mode === 'temps' && (
        <TempsPage
          slot={tempSlot}
          onSlot={setTempSlot}
          readings={temps}
          onReading={editTemp}
          synced={synced}
        />
      )}

      <HistoryCard onPick={(d) => setDate(d)} />
      {mode !== 'temps' && <BibleViewer bible={bibles[activeBible]} />}

      {/* Graph drawers close their pages (owner's ask): a look-at-sometimes
          panel belongs after everything used on an ordinary night. */}
      {mode === '2pm' && (
        <div className="band">
          <GraphsCard />
        </div>
      )}
      {mode === 'temps' && (
        <div className="band">
          <TempGraph />
        </div>
      )}
      <Footer />
    </div>
  );
}
