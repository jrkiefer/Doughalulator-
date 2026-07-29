import { defaultConfig } from '../../config';
import type { PerSize } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';
import { fmt, type CountsFields } from './counts';

type CountKey = keyof CountsFields;

function CountField(props: {
  label: string;
  formKey: CountKey;
  fields: CountsFields;
  onChange: (patch: Partial<CountsFields>) => void;
}) {
  return (
    <div className="fld">
      <span className="micro">{props.label}</span>
      <input
        className="input"
        inputMode="numeric"
        placeholder="0"
        aria-label={props.label}
        value={props.fields[props.formKey]}
        onChange={(e) => props.onChange({ [props.formKey]: e.target.value })}
      />
    </div>
  );
}

/** The five color-coded dough count cards, shared by the 2 PM and EON pages. */
export function CountCards(props: {
  fields: CountsFields;
  onChange: (patch: Partial<CountsFields>) => void;
  have: PerSize;
  note: string;
}) {
  const { fields, onChange, have } = props;
  const cfg = defaultConfig;
  const bpt = cfg.ballsPerTray;

  return (
    <>
      <SectionHead num="02" title="Current Dough Counts" note={props.note} />
      <div className="count-grid">
        <div className="count-card" style={{ ['--size' as string]: 'var(--indi)' }}>
          <div className="head">
            <span className="name">Individual</span>
            <span className="hint">{bpt.indi} / tray</span>
          </div>
          <div className="fields">
            <CountField label="TRAYS" formKey="indiTrays" fields={fields} onChange={onChange} />
            <CountField label="SINGLES" formKey="indiSingles" fields={fields} onChange={onChange} />
          </div>
          <div className="balls">
            = <strong>{fmt(have.indi)}</strong> balls
          </div>
        </div>

        <div className="count-card" style={{ ['--size' as string]: 'var(--small)' }}>
          <div className="head">
            <span className="name">Small</span>
            <span className="hint">{bpt.small} / tray</span>
          </div>
          <div className="fields">
            <CountField label="TRAYS" formKey="smallTrays" fields={fields} onChange={onChange} />
            <CountField label="SINGLES" formKey="smallSingles" fields={fields} onChange={onChange} />
          </div>
          <div className="balls">
            = <strong>{fmt(have.small)}</strong> balls
          </div>
        </div>

        <div className="count-card" style={{ ['--size' as string]: 'var(--large)' }}>
          <div className="head">
            <span className="name">Large</span>
            <span className="hint">{bpt.large} / tray</span>
          </div>
          <div className="fields">
            <CountField label="TRAYS" formKey="largeTrays" fields={fields} onChange={onChange} />
            <CountField label="SINGLES" formKey="largeSingles" fields={fields} onChange={onChange} />
          </div>
          <div className="balls">
            = <strong>{fmt(have.large)}</strong> balls
          </div>
        </div>

        <div className="count-card" style={{ ['--size' as string]: 'var(--sic)' }}>
          <div className="head">
            <span className="name">Sicilian</span>
            <span className="hint">min {cfg.sicMinBalls} balls</span>
          </div>
          <div className="fields single">
            <CountField label="BALLS" formKey="sicSingles" fields={fields} onChange={onChange} />
          </div>
        </div>

        <div className="count-card wide" style={{ ['--size' as string]: 'var(--boil)' }}>
          <div className="head">
            <span className="name">Boil Dough</span>
            <span className="hint">
              target {cfg.boilTargetTrays * bpt.boil} · {bpt.boil} / tray
            </span>
          </div>
          <div className="fields">
            <CountField label="TRAYS" formKey="boilTrays" fields={fields} onChange={onChange} />
            <CountField label="SINGLES" formKey="boilSingles" fields={fields} onChange={onChange} />
          </div>
          <div className="balls">
            = <strong>{fmt(have.boil)}</strong> balls
          </div>
        </div>
      </div>
    </>
  );
}
