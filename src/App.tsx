import { useState } from 'react';
import { defaultConfig, type BibleId } from './config';
import { computeHave, runDoughCalculation, selectBibleId, slotForTime, type TempSlot } from './core';
import { bibles } from './features/bibleData';
import { BibleViewer } from './features/bibleViewer/BibleViewer';
import { EonPage } from './features/eon/EonPage';
import { emptyEonForm, type EonForm } from './features/eon/formState';
import { ActiveDate } from './features/shell/ActiveDate';
import { BibleToggle } from './features/shell/BibleToggle';
import { Footer } from './features/shell/Footer';
import { Header } from './features/shell/Header';
import { ModeNav, type Mode } from './features/shell/ModeNav';
import { emptyTempReadings, TempsPage, type TempReadings } from './features/temps/TempsPage';
import { parseCounts, toNum } from './features/shared/counts';
import { emptyTwoPmForm, salesComplete, type TwoPmForm } from './features/twoPm/formState';
import { TwoPmPage } from './features/twoPm/TwoPmPage';
import type { Rounding } from './features/twoPm/DaysWork';

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
  const [date, setDate] = useState(todayIso());
  const [bibleOverride, setBibleOverride] = useState<BibleId | undefined>(undefined);
  const [form, setForm] = useState<TwoPmForm>(emptyTwoPmForm);
  const [rounding, setRounding] = useState<Rounding>(null);
  const [eonForm, setEonForm] = useState<EonForm>(emptyEonForm);
  const [tempSlot, setTempSlot] = useState<TempSlot>(() => slotForTime(nowHhMm(), cfg));
  const [temps, setTemps] = useState<TempReadings>(emptyTempReadings);

  const activeBible = bibleOverride ?? selectBibleId(date, cfg);

  // The live 2 PM session doubles as "the day's record" for the EON page
  // until real storage arrives in phase 4.
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

  function reset() {
    if (!window.confirm('Start over? This clears the whole form.')) return;
    setDate(todayIso());
    setBibleOverride(undefined);
    setForm(emptyTwoPmForm);
    setRounding(null);
    setEonForm(emptyEonForm);
    setTempSlot(slotForTime(nowHhMm(), cfg));
    setTemps(emptyTempReadings);
  }

  return (
    <div className="page">
      <div className="band">
        <Header onReset={reset} />
        <ActiveDate date={date} onChange={setDate} />
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
        />
      )}
      {mode === 'eon' && (
        <EonPage
          date={date}
          bibleOverride={bibleOverride}
          dayRecord={dayRecord}
          form={eonForm}
          onFormChange={(patch) => setEonForm((f) => ({ ...f, ...patch }))}
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
        />
      )}

      {mode !== 'temps' && <BibleViewer bible={bibles[activeBible]} />}
      <Footer />
    </div>
  );
}
