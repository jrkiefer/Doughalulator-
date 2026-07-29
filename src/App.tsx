import { useEffect, useState } from 'react';
import { defaultConfig, type BibleId } from './config';
import {
  computeAmUse,
  computeHave,
  normalizeSales,
  runDoughCalculation,
  selectBibleId,
  slotForTime,
  type TempSlot,
} from './core';
import type { EonRecord, PerSize } from './core/types';
import { bibles } from './features/bibleData';
import { BibleViewer } from './features/bibleViewer/BibleViewer';
import { EonPage } from './features/eon/EonPage';
import { emptyEonForm, type EonForm } from './features/eon/formState';
import { SettingsPage } from './features/settings/SettingsPage';
import { ActiveDate } from './features/shell/ActiveDate';
import { BibleToggle } from './features/shell/BibleToggle';
import { Footer } from './features/shell/Footer';
import { Header, type AppStatus } from './features/shell/Header';
import { ModeNav, type Mode } from './features/shell/ModeNav';
import { emptyTempReadings, TempsPage, type TempReadings } from './features/temps/TempsPage';
import { parseCounts, toNum } from './features/shared/counts';
import { emptyTwoPmForm, salesComplete, type TwoPmForm } from './features/twoPm/formState';
import { TwoPmPage } from './features/twoPm/TwoPmPage';
import type { Rounding } from './features/twoPm/DaysWork';
import { fetchYesterdayEonHave, loadDate, saveDayRecord, saveEonRecord, syncBibles } from './services/doughService';
import { queuedItems } from './services/local';
import { flushQueue } from './services/queue';
import { loadSettings, type SheetSettings } from './services/settings';
import { fetchLatestTemps, saveTemps } from './services/tempsService';

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

export default function App() {
  const cfg = defaultConfig;
  const [mode, setMode] = useState<Mode>('2pm');
  const [showSettings, setShowSettings] = useState(false);
  const [status, setStatus] = useState<AppStatus>('new');
  const [settings, setSettings] = useState<SheetSettings>(loadSettings);
  const [date, setDate] = useState(todayIso());
  const [bibleOverride, setBibleOverride] = useState<BibleId | undefined>(undefined);
  const [form, setForm] = useState<TwoPmForm>(emptyTwoPmForm);
  const [rounding, setRounding] = useState<Rounding>(null);
  const [eonForm, setEonForm] = useState<EonForm>(emptyEonForm);
  const [tempSlot, setTempSlot] = useState<TempSlot>(() => slotForTime(nowHhMm(), cfg));
  const [temps, setTemps] = useState<TempReadings>(emptyTempReadings);
  const [yesterdayEonHave, setYesterdayEonHave] = useState<PerSize | null>(null);
  const [loadMsg, setLoadMsg] = useState('');
  const [saveMsg2pm, setSaveMsg2pm] = useState('Ready when you are.');
  const [saveMsgEon, setSaveMsgEon] = useState('Ready when you are.');
  const [saveMsgTemps, setSaveMsgTemps] = useState('Ready when you are.');
  const [lastTempsNote, setLastTempsNote] = useState('');

  const activeBible = bibleOverride ?? selectBibleId(date, cfg);

  // The live 2 PM session doubles as "the day's record" for the EON page.
  const counts = parseCounts(form);
  const have = computeHave(counts, cfg);
  const baseRecord = salesComplete(form)
    ? runDoughCalculation(
        {
          date,
          counts,
          todayForecastRaw: toNum(form.todayForecast),
          currentSalesRaw: toNum(form.currentSales),
          tomorrowForecastRaw: toNum(form.tomorrowForecast),
          bibleOverride,
        },
        bibles,
        cfg,
      )
    : null;
  const dayRecord = baseRecord ? { ...baseRecord, chosenBatchOption: rounding } : null;

  // AM use appears once yesterday's EON exists (from the sheet or this phone).
  const currentSales$ =
    dayRecord?.currentSales ?? normalizeSales(toNum(form.currentSales), cfg.salesShorthand);
  const amUse = computeAmUse(
    yesterdayEonHave ? { eonHave: yesterdayEonHave } : null,
    have,
    currentSales$,
  );

  // On open: push anything the phone queued while offline.
  useEffect(() => {
    if (queuedItems().length === 0) return;
    setStatus('unsynced');
    flushQueue(loadSettings()).then((r) => {
      if (r.remaining === 0 && r.sent > 0) setStatus('saved');
    });
  }, []);

  // Fetch yesterday's EON for the AM-use math whenever the date changes.
  useEffect(() => {
    let alive = true;
    setYesterdayEonHave(null);
    fetchYesterdayEonHave(date, settings).then((h) => {
      if (alive) setYesterdayEonHave(h);
    });
    return () => {
      alive = false;
    };
  }, [date, settings]);

  function reset() {
    if (!window.confirm('Start over? This clears the whole form.')) return;
    setDate(todayIso());
    setBibleOverride(undefined);
    setForm(emptyTwoPmForm);
    setRounding(null);
    setEonForm(emptyEonForm);
    setTempSlot(slotForTime(nowHhMm(), cfg));
    setTemps(emptyTempReadings);
    setStatus('new');
    setLoadMsg('');
    setSaveMsg2pm('Ready when you are.');
    setSaveMsgEon('Ready when you are.');
    setSaveMsgTemps('Ready when you are.');
    setLastTempsNote('');
  }

  async function handleLoadFromSheet() {
    setLoadMsg('Loading…');
    const loaded = await loadDate(date, settings);
    if (!loaded) {
      setLoadMsg('Nothing saved for this date yet.');
      return;
    }
    if (loaded.sales || loaded.counts) {
      setForm((f) => ({
        ...f,
        ...(loaded.sales ?? {}),
        ...((loaded.counts ?? {}) as Partial<TwoPmForm>),
      }));
    }
    setRounding(loaded.rounding);
    if (loaded.eonCounts || loaded.finalSales !== null) {
      setEonForm((f) => ({
        ...f,
        ...((loaded.eonCounts ?? {}) as Partial<EonForm>),
        ...(loaded.finalSales !== null ? { finalSales: loaded.finalSales } : {}),
      }));
    }
    setStatus('loaded');
    setLoadMsg(loaded.source === 'sheet' ? 'Loaded from the sheet ✓' : 'Loaded from this phone ✓');
  }

  async function handleSave2pm() {
    if (!dayRecord || !dayRecord.chosenBatchOption) return;
    setSaveMsg2pm('Saving…');
    const outcome = await saveDayRecord(dayRecord, amUse, settings);
    void syncBibles(bibles, settings);
    setStatus(outcome === 'synced' ? 'saved' : 'unsynced');
    setSaveMsg2pm(outcome === 'synced' ? 'Saved to the sheet ✓' : 'Saved on phone — will sync');
  }

  async function handleSaveEon(record: EonRecord) {
    setSaveMsgEon('Saving…');
    const outcome = await saveEonRecord(record, settings);
    void syncBibles(bibles, settings);
    setStatus(outcome === 'synced' ? 'saved' : 'unsynced');
    setSaveMsgEon(outcome === 'synced' ? 'Saved to the sheet ✓' : 'Saved on phone — will sync');
  }

  async function handleSaveTemps() {
    setSaveMsgTemps('Saving…');
    try {
      const outcome = await saveTemps(date, nowHhMm(), tempSlot, temps[tempSlot], settings, cfg);
      setStatus(outcome === 'synced' ? 'saved' : 'unsynced');
      setSaveMsgTemps(outcome === 'synced' ? 'Saved to the sheet ✓' : 'Saved on phone — will sync');
    } catch {
      setSaveMsgTemps('Nothing to save yet.');
    }
  }

  async function handleLoadLastTemps() {
    setLastTempsNote('Loading…');
    const latest = await fetchLatestTemps(settings);
    if (!latest || Object.keys(latest).length === 0) {
      setLastTempsNote('No previous readings found.');
      return;
    }
    setTemps((t) => ({
      ...t,
      [tempSlot]: {
        ...t[tempSlot],
        ...Object.fromEntries(Object.entries(latest).map(([s, r]) => [s, String(r.temp)])),
      },
    }));
    const whens = [...new Set(Object.values(latest).map((r) => r.when))].sort();
    setLastTempsNote(`Readings from ${whens[whens.length - 1]} — whatever is in the fields is what saves.`);
  }

  if (showSettings) {
    return (
      <div className="page">
        <div className="band">
          <Header status={status} onReset={reset} />
        </div>
        <SettingsPage
          settings={settings}
          onChange={setSettings}
          onBack={() => setShowSettings(false)}
        />
        <Footer onSettings={() => setShowSettings(true)} />
      </div>
    );
  }

  return (
    <div className="page">
      <div className="band">
        <Header status={status} onReset={reset} />
        <ActiveDate date={date} onChange={setDate} onLoad={handleLoadFromSheet} loadMsg={loadMsg} />
        {mode !== 'temps' && (
          <BibleToggle
            active={activeBible}
            isAuto={bibleOverride === undefined}
            onOverride={setBibleOverride}
          />
        )}
        <ModeNav mode={mode} onChange={setMode} />
      </div>

      {mode === '2pm' && (
        <TwoPmPage
          record={dayRecord}
          have={have}
          form={form}
          onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          rounding={rounding}
          onRounding={setRounding}
          amUse={amUse}
          onSave={handleSave2pm}
          saveMsg={saveMsg2pm}
        />
      )}
      {mode === 'eon' && (
        <EonPage
          date={date}
          bibleOverride={bibleOverride}
          dayRecord={dayRecord}
          form={eonForm}
          onFormChange={(patch) => setEonForm((f) => ({ ...f, ...patch }))}
          onSave={handleSaveEon}
          saveMsg={saveMsgEon}
        />
      )}
      {mode === 'temps' && (
        <TempsPage
          slot={tempSlot}
          onSlot={setTempSlot}
          readings={temps}
          onReading={(slot, station, value) =>
            setTemps((t) => ({ ...t, [slot]: { ...t[slot], [station]: value } }))
          }
          onSave={handleSaveTemps}
          saveMsg={saveMsgTemps}
          onLoadLast={handleLoadLastTemps}
          loadNote={lastTempsNote}
        />
      )}

      {mode !== 'temps' && <BibleViewer bible={bibles[activeBible]} />}
      <Footer onSettings={() => setShowSettings(true)} />
    </div>
  );
}
