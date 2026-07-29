import { useState } from 'react';
import { pingDough } from '../../services/doughService';
import { pingTemps } from '../../services/tempsService';
import { saveSettings, type SheetSettings } from '../../services/settings';
import { SectionHead } from '../shell/SectionHead';

function Field(props: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ padding: '8px 0' }}>
      <span className="micro" style={{ display: 'block', marginBottom: 6 }}>
        {props.label}
      </span>
      <input
        className="input"
        type="text"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        placeholder={props.placeholder ?? ''}
        aria-label={props.label}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </div>
  );
}

/** Where the two Apps Script web apps live. Stored on the phone only. */
export function SettingsPage(props: {
  settings: SheetSettings;
  onChange: (s: SheetSettings) => void;
  onBack: () => void;
}) {
  const { settings } = props;
  const [doughStatus, setDoughStatus] = useState('');
  const [tempsStatus, setTempsStatus] = useState('');

  function update(patch: Partial<SheetSettings>) {
    const next = { ...settings, ...patch };
    props.onChange(next);
    saveSettings(next);
  }

  async function testDough() {
    setDoughStatus('Testing…');
    const error = await pingDough(settings);
    setDoughStatus(error ? `Couldn't reach it — ${error}` : 'Connected ✓');
  }

  async function testTemps() {
    setTempsStatus('Testing…');
    const error = await pingTemps(settings);
    setTempsStatus(error ? `Couldn't reach it — ${error}` : 'Connected ✓');
  }

  return (
    <div className="band">
      <SectionHead num="10" title="Settings" note="SHEET CONNECTIONS" />
      <div className="card">
        <span className="label">DOUGH LOG SHEET</span>
        <Field
          label="SCRIPT URL"
          value={settings.doughUrl}
          onChange={(v) => update({ doughUrl: v })}
          placeholder="https://script.google.com/…"
        />
        <Field
          label="SECRET"
          value={settings.doughSecret}
          onChange={(v) => update({ doughSecret: v })}
        />
        <button className="pill pill-sm" onClick={testDough} disabled={!settings.doughUrl.trim()}>
          Test Connection
        </button>
        {doughStatus && <p className="days-work-note">{doughStatus}</p>}

        <hr className="dashed-divider" />

        <span className="label">TEMP LOG SHEET</span>
        <Field
          label="SCRIPT URL"
          value={settings.tempsUrl}
          onChange={(v) => update({ tempsUrl: v })}
          placeholder="https://script.google.com/…"
        />
        <Field
          label="SECRET"
          value={settings.tempsSecret}
          onChange={(v) => update({ tempsSecret: v })}
        />
        <button className="pill pill-sm" onClick={testTemps} disabled={!settings.tempsUrl.trim()}>
          Test Connection
        </button>
        {tempsStatus && <p className="days-work-note">{tempsStatus}</p>}
      </div>

      <div className="save-bar">
        <button className="btn-primary" onClick={props.onBack}>
          DONE
        </button>
        <div className="coming-note">Settings save on the phone as you type.</div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
