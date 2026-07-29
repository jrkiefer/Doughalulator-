import { useState } from 'react';
import { defaultConfig, type BibleId } from './config';
import { selectBibleId } from './core';
import { bibles } from './features/bibleData';
import { BibleViewer } from './features/bibleViewer/BibleViewer';
import { ActiveDate } from './features/shell/ActiveDate';
import { BibleToggle } from './features/shell/BibleToggle';
import { Footer } from './features/shell/Footer';
import { Header } from './features/shell/Header';
import { ModeNav, type Mode } from './features/shell/ModeNav';
import { emptyTwoPmForm, type TwoPmForm } from './features/twoPm/formState';
import { TwoPmPage } from './features/twoPm/TwoPmPage';
import type { Rounding } from './features/twoPm/DaysWork';

function todayIso(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export default function App() {
  const [mode, setMode] = useState<Mode>('2pm');
  const [date, setDate] = useState(todayIso());
  const [bibleOverride, setBibleOverride] = useState<BibleId | undefined>(undefined);
  const [form, setForm] = useState<TwoPmForm>(emptyTwoPmForm);
  const [rounding, setRounding] = useState<Rounding>(null);

  const activeBible = bibleOverride ?? selectBibleId(date, defaultConfig);

  function reset() {
    if (!window.confirm('Start over? This clears the whole form.')) return;
    setDate(todayIso());
    setBibleOverride(undefined);
    setForm(emptyTwoPmForm);
    setRounding(null);
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
          date={date}
          bibleOverride={bibleOverride}
          form={form}
          onFormChange={(patch) => setForm((f) => ({ ...f, ...patch }))}
          rounding={rounding}
          onRounding={setRounding}
        />
      )}
      {mode === 'eon' && (
        <div className="band">
          <div className="placeholder-card">The EON page is built in the next phase.</div>
        </div>
      )}
      {mode === 'temps' && (
        <div className="band">
          <div className="placeholder-card">The Station Temps page is built in the next phase.</div>
        </div>
      )}

      {mode !== 'temps' && <BibleViewer bible={bibles[activeBible]} />}
      <Footer />
    </div>
  );
}
