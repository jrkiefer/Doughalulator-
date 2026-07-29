import { defaultConfig } from '../../config';
import type { PerSize } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';
import { fmt, type TwoPmForm } from './formState';

type FormKey = keyof TwoPmForm;

function CountField(props: {
  label: string;
  formKey: FormKey;
  form: TwoPmForm;
  onChange: (patch: Partial<TwoPmForm>) => void;
}) {
  return (
    <div className="fld">
      <span className="micro">{props.label}</span>
      <input
        className="input"
        inputMode="numeric"
        placeholder="0"
        aria-label={props.label}
        value={props.form[props.formKey]}
        onChange={(e) => props.onChange({ [props.formKey]: e.target.value })}
      />
    </div>
  );
}

export function CountCards(props: {
  form: TwoPmForm;
  onChange: (patch: Partial<TwoPmForm>) => void;
  have: PerSize;
}) {
  const { form, onChange, have } = props;
  const cfg = defaultConfig;
  const bpt = cfg.ballsPerTray;

  return (
    <>
      <SectionHead num="02" title="Current Dough Counts" note="TRAYS + SINGLES" />
      <div className="count-grid">
        <div className="count-card" style={{ ['--size' as string]: 'var(--indi)' }}>
          <div className="head">
            <span className="name">Individual</span>
            <span className="hint">{bpt.indi} / tray</span>
          </div>
          <div className="fields">
            <CountField label="TRAYS" formKey="indiTrays" form={form} onChange={onChange} />
            <CountField label="SINGLES" formKey="indiSingles" form={form} onChange={onChange} />
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
            <CountField label="TRAYS" formKey="smallTrays" form={form} onChange={onChange} />
            <CountField label="SINGLES" formKey="smallSingles" form={form} onChange={onChange} />
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
            <CountField label="TRAYS" formKey="largeTrays" form={form} onChange={onChange} />
            <CountField label="SINGLES" formKey="largeSingles" form={form} onChange={onChange} />
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
            <CountField label="BALLS" formKey="sicSingles" form={form} onChange={onChange} />
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
            <CountField label="TRAYS" formKey="boilTrays" form={form} onChange={onChange} />
            <CountField label="SINGLES" formKey="boilSingles" form={form} onChange={onChange} />
          </div>
          <div className="balls">
            = <strong>{fmt(have.boil)}</strong> balls
          </div>
        </div>
      </div>
    </>
  );
}
