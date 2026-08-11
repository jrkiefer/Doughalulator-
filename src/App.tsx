import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { defaultConfig, type BibleId } from './config';
import { runDoughCalculation, runEonCalculation, selectBibleId, slotForTime, type TempSlot } from './core';
import type { DoughDayRecord } from './core/types';
import { bibles } from './features/bibleData';
import { BibleViewer } from './features/bibleViewer/BibleViewer';
import { EonPage } from './features/eon/EonPage';
import { emptyEonForm, type EonForm } from './features/eon/formState';
import { HistoryCard } from './features/history/HistoryCard';
import { AgreementCheck } from './features/shell/AgreementCheck';
import { SettingsPage } from './features/settings/SettingsPage';
import { ActiveDate } from './features/shell/ActiveDate';
import { BibleToggle } from './features/shell/BibleToggle';
import { Footer } from './features/shell/Footer';
import { Header } from './features/shell/Header';
import { ModeNav, type Mode } from './features/shell/ModeNav';
import { emptyTempReadings, TempsPage, type TempReadings } from './features/temps/TempsPage';
import { parseCounts, toNumOrNull } from './features/shared/counts';
import { emptyTwoPmForm, type TwoPmForm } from './features/twoPm/formState';
import { TwoPmPage } from './features/twoPm/TwoPmPage';
import type { Rounding } from './features/twoPm/DaysWork';
import { checkAgreement, type SheetTabs } from './services/agreement';
import { postJson } from './services/client';
import { fetchDate, type FetchedDay } from './services/doughService';
import {
  cachedLatestTemps,
  cacheLatestTemps,
  clearEntry,
  freshMeta,
  listCachedDates,
  loadEntry,
  saveEntry,
  sweepStaleKeys,
  type DateEntry,
} from './services/local';
import { dayRecordToTabWrites, eonRecordToTabWrites } from './services/mapping';
import { loadSettings, type SheetSettings } from './services/settings';
import { createSyncEngine } from './services/sync';
import { fetchLatestTemps, tempsEntryToPayload } from './services/tempsService';

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

function formHasContent(form: Record<string, string>): boolean {
  return Object.values(form).some((v) => v.trim() !== '');
}

/** The day record for a date, straight from form state (pure, blank-aware). */
function buildDayRecord(
  date: string,
  form: TwoPmForm,
  rounding: Rounding,
  bibleOverride: BibleId | undefined,
): DoughDayRecord {
  const record = runDoughCalculation(
    {
      date,
      counts: parseCounts(form),
      todayForecastRaw: toNumOrNull(form.todayForecast),
      currentSalesRaw: toNumOrNull(form.currentSales),
      tomorrowForecastRaw: toNumOrNull(form.tomorrowForecast),
      bibleOverride,
    },
    bibles,
    cfg,
  );
  return { ...record, chosenBatchOption: rounding };
}

// ————— the sync engine, wired to real storage / network / clock —————

const engine = createSyncEngine({
  now: () => Date.now(),
  loadEntry,
  saveEntry,
  clearEntry,
  listDates: listCachedDates,
  buildPayload: (type, date, entry) => {
    if (type === 'day') {
      const day = entry.day;
      if (!day || (!formHasContent(day.form) && day.rounding === null)) return null;
      const form = { ...emptyTwoPmForm, ...day.form };
      const record = buildDayRecord(date, form, day.rounding, day.bibleOverride ?? undefined);
      return { type: 'day', date, tabs: dayRecordToTabWrites(record) };
    }
    if (type === 'eon') {
      const eon = entry.eon;
      if (!eon || !formHasContent(eon.form)) return null;
      const eonForm = { ...emptyEonForm, ...eon.form };
      const day = entry.day;
      const dayRecord =
        day && (formHasContent(day.form) || day.rounding !== null)
          ? buildDayRecord(date, { ...emptyTwoPmForm, ...day.form }, day.rounding, day.bibleOverride ?? undefined)
          : null;
      const record = runEonCalculation(
        {
          date,
          counts: parseCounts(eonForm),
          finalSalesRaw: toNumOrNull(eonForm.finalSales),
          manualTomorrowForecastRaw: toNumOrNull(eonForm.manualTomorrowForecast),
          bibleOverride: day?.bibleOverride ?? undefined,
        },
        dayRecord,
        bibles,
        cfg,
      );
      return { type: 'eon', date, tabs: eonRecordToTabWrites(record) };
    }
    return entry.temps ? tempsEntryToPayload(date, entry.temps, cfg) : null;
  },
  post: (target, payload, opts) => {
    const s = loadSettings();
    const url = target === 'dough' ? s.doughUrl : s.tempsUrl;
    const secret = target === 'dough' ? s.doughSecret : s.tempsSecret;
    if (!url.trim()) {
      return Promise.resolve({ kind: 'retryable' as const, error: 'no sheet connected yet' });
    }
    return postJson(url, { secret, ...payload }, opts);
  },
  setTimer: (fn, ms) => setTimeout(fn, ms),
  clearTimer: (id) => clearTimeout(id),
});

/** Write a sheet fetch into a date's entry (form-shaped; blanks stay blank). */
function applyFetchedToEntry(entry: DateEntry, fetched: FetchedDay, date: string): void {
  const now = Date.now();
  const overrideFrom = (bible: FetchedDay['bible']) =>
    bible && bible !== selectBibleId(date, cfg) ? bible : null;
  if (fetched.sales || fetched.counts || fetched.rounding) {
    entry.day = {
      form: { ...emptyTwoPmForm, ...(fetched.counts ?? {}), ...(fetched.sales ?? {}) },
      rounding: fetched.rounding,
      bibleOverride: overrideFrom(fetched.bible),
      ...freshMeta(now),
    };
  }
  if (fetched.eonCounts || (fetched.finalSales !== null && fetched.finalSales !== '')) {
    entry.eon = {
      form: { ...emptyEonForm, ...(fetched.eonCounts ?? {}), finalSales: fetched.finalSales ?? '' },
      ...freshMeta(now),
    };
  }
}

export default function App() {
  const [mode, setMode] = useState<Mode>('2pm');
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<SheetSettings>(loadSettings);
  const [date, setDate] = useState(todayIso());
  const [form, setForm] = useState<TwoPmForm>(emptyTwoPmForm);
  const [rounding, setRounding] = useState<Rounding>(null);
  const [bibleOverride, setBibleOverride] = useState<BibleId | undefined>(undefined);
  const [eonForm, setEonForm] = useState<EonForm>(emptyEonForm);
  const [tempSlot, setTempSlot] = useState<TempSlot>(() => slotForTime(nowHhMm(), cfg));
  const [temps, setTemps] = useState<TempReadings>(emptyTempReadings);
  const [loadMsg, setLoadMsg] = useState('');
  const [loadArmed, setLoadArmed] = useState(false);
  const [resetArmed, setResetArmed] = useState(false);
  const [lastTempsNote, setLastTempsNote] = useState('');
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  // What the sheet's own formulas worked out for this date, for the bottom check.
  const [sheetTabs, setSheetTabs] = useState<SheetTabs | null>(null);
  const [checkNote, setCheckNote] = useState('');
  const [checkSeq, setCheckSeq] = useState(0);
  const [, setTick] = useState(0);

  const rehydrate = useCallback((forDate: string) => {
    const entry = engine.getEntry(forDate);
    setForm({ ...emptyTwoPmForm, ...(entry.day?.form ?? {}) });
    setRounding(entry.day?.rounding ?? null);
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
    setSheetTabs(null);
    setCheckNote('');
  }

  // Boot: sweep pre-rename caches, resend anything dirty, wire the retry triggers.
  useEffect(() => {
    sweepStaleKeys();
    engine.start();
    const unsubscribe = engine.subscribe(() => setTick((t) => t + 1));
    const onOnline = () => void engine.flush();
    // Leaving a FIELD syncs right away instead of waiting out the debounce.
    // Scoped to inputs: blurring a button or a card header has nothing to send.
    const onFocusOut = (event: FocusEvent) => {
      if (event.target instanceof HTMLInputElement) void engine.flush();
    };
    const onHide = () => {
      if (document.visibilityState === 'hidden') void engine.flush({ keepalive: true });
    };
    const onPageHide = () => void engine.flush({ keepalive: true });
    window.addEventListener('online', onOnline);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      unsubscribe();
      window.removeEventListener('online', onOnline);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onPageHide);
    };
  }, [rehydrate]);

  // Behind the instant paint, fetch the date from the sheet and merge (§4).
  // Short delay first: stepping through days with ◀ ▶ should fetch the day the
  // owner lands on, not every day they pass through.
  useEffect(() => {
    let alive = true;
    const seqBefore = engine.editSeq(date);
    const timer = setTimeout(() => {
      fetchDate(date, loadSettings()).then((result) => {
        if (!alive || result.kind !== 'loaded') return;
        // Keystroke guard: typing during the fetch discards the fetched record.
        if (engine.editSeq(date) !== seqBefore) return;
        const applied = engine.applyFetched(date, (entry) => applyFetchedToEntry(entry, result.day, date));
        if (applied === 'replaced') rehydrate(date);
        else setLoadMsg('Phone copy kept — tap LOAD FROM SHEET to pull the sheet.');
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [date, rehydrate, checkSeq]);

  const record = useMemo(
    () => buildDayRecord(date, form, rounding, bibleOverride),
    [date, form, rounding, bibleOverride],
  );
  const status = engine.status(date);
  const synced = status.state === 'synced';
  const agreement = useMemo(() => checkAgreement(record, sheetTabs), [record, sheetTabs]);

  // Each time a save completes the sheet has recalculated — pull it back and
  // re-run the comparison so the bottom line reflects what is actually stored.
  const wasSynced = useRef(false);
  useEffect(() => {
    if (synced && !wasSynced.current) setCheckSeq((n) => n + 1);
    wasSynced.current = synced;
  }, [synced]);
  const activeBible = bibleOverride ?? selectBibleId(date, cfg);

  // ————— edits: React state + engine, in lockstep —————

  function editDay(patch: Partial<TwoPmForm>) {
    setForm((f) => ({ ...f, ...patch }));
    engine.edit(date, 'day', (rec) => {
      rec.form = { ...emptyTwoPmForm, ...rec.form, ...patch };
    });
  }

  function editRounding(r: 'down' | 'up') {
    setRounding(r);
    engine.edit(date, 'day', (rec) => {
      rec.rounding = r;
    });
    void engine.flush(); // a tap is a finished decision — no debounce wait
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
    const temp = Number(value);
    if (value.trim() !== '' && Number.isFinite(temp)) {
      const slotName = { morning: cfg.tempSlots.names.morning, midday: cfg.tempSlots.names.midday, night: cfg.tempSlots.names.night }[slot];
      cacheLatestTemps({
        ...(cachedLatestTemps() ?? {}),
        [station]: { temp, slot: slotName, when: `${date} ${time}` },
      });
    }
  }

  // ————— load / reset (§4) —————

  async function handleLoad() {
    if (engine.isDirty(date) && !loadArmed) {
      setLoadArmed(true);
      setLoadMsg('This will replace unsynced edits — tap again to confirm.');
      return;
    }
    setLoadArmed(false);
    setLoadMsg('Loading…');
    const result = await fetchDate(date, loadSettings());
    if (result.kind === 'empty') return setLoadMsg('The sheet has no row for this date.');
    if (result.kind === 'unreachable') return setLoadMsg("Can't reach the sheet — check Settings or connection.");
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

    engine.overwrite(date, (entry) => applyFetchedToEntry(entry, result.day, date));
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

  async function handleLoadLastTemps() {
    setLastTempsNote('Loading…');
    const latest = await fetchLatestTemps(loadSettings());
    if (!latest || Object.keys(latest).length === 0) {
      setLastTempsNote('No previous readings found.');
      return;
    }
    for (const [station, r] of Object.entries(latest)) {
      editTemp(tempSlot, station, String(r.temp));
    }
    const whens = [...new Set(Object.values(latest).map((r) => r.when))].sort();
    setLastTempsNote(`Readings from ${whens[whens.length - 1]} — whatever is in the fields is what saves.`);
  }

  if (showSettings) {
    return (
      <div className="page">
        <div className="band">
          <Header status={status} resetArmed={false} onReset={() => undefined} />
        </div>
        <SettingsPage
          settings={settings}
          onChange={(next) => {
            setSettings(next);
            void engine.flush();
          }}
          onBack={() => setShowSettings(false)}
        />
        <Footer onSettings={() => setShowSettings(true)} />
      </div>
    );
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
          rounding={rounding}
          onRounding={editRounding}
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
          onLoadLast={handleLoadLastTemps}
          loadNote={lastTempsNote}
          synced={synced}
        />
      )}

      <HistoryCard onPick={(d) => setDate(d)} />
      {mode !== 'temps' && <BibleViewer bible={bibles[activeBible]} />}
      <AgreementCheck agreement={agreement} note={checkNote} />
      <Footer onSettings={() => setShowSettings(true)} />
    </div>
  );
}
