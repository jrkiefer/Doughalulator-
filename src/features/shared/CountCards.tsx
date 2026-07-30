import type { ReactNode } from 'react';
import { defaultConfig } from '../../config';
import type { Maybe, PerSizeMaybe } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';
import { fmtMaybe, type CountsFields } from './counts';
import { numericChangeHandler } from './inputs';

type CountKey = keyof CountsFields;

function CountField(props: {
  label: string;
  formKey: CountKey;
  fields: CountsFields;
  onChange: (patch: Partial<CountsFields>) => void;
  synced: boolean;
}) {
  const value = props.fields[props.formKey];
  return (
    <div className="fld">
      <span className="micro">{props.label}</span>
      <div className="input-wrap">
        <input
          className="input"
          type="text"
          inputMode="numeric"
          aria-label={props.label}
          value={value}
          onChange={numericChangeHandler({}, (v) => props.onChange({ [props.formKey]: v }))}
        />
        {props.synced && value.trim() !== '' && <span className="chip">✓</span>}
      </div>
    </div>
  );
}

/**
 * The five color-coded dough count cards, shared by the 2 PM and EON pages.
 * Blank fields stay blank — an uncounted size shows "—", never a fake 0.
 */
export function CountCards(props: {
  fields: CountsFields;
  onChange: (patch: Partial<CountsFields>) => void;
  have: PerSizeMaybe;
  note: string;
  synced: boolean;
}) {
  const { fields, onChange, have, synced } = props;
  const cfg = defaultConfig;
  const bpt = cfg.ballsPerTray;

  const card = (
    color: string,
    name: string,
    hint: string,
    body: ReactNode,
    haveValue: Maybe,
    wide = false,
  ) => (
    <div className={`count-card${wide ? ' wide' : ''}`} style={{ ['--size' as string]: color }}>
      <div className="head">
        <span className="name">{name}</span>
        <span className="hint">{hint}</span>
      </div>
      {body}
      <div className="balls">
        = <strong>{fmtMaybe(haveValue)}</strong> balls
      </div>
    </div>
  );

  const pair = (traysKey: CountKey, singlesKey: CountKey) => (
    <div className="fields">
      <CountField label="TRAYS" formKey={traysKey} fields={fields} onChange={onChange} synced={synced} />
      <CountField label="SINGLES" formKey={singlesKey} fields={fields} onChange={onChange} synced={synced} />
    </div>
  );

  return (
    <>
      <SectionHead num="02" title="Current Dough Counts" note={props.note} />
      <div className="count-grid">
        {card('var(--indi)', 'Individual', `${bpt.indi} / tray`, pair('indiTrays', 'indiSingles'), have.indi)}
        {card('var(--small)', 'Small', `${bpt.small} / tray`, pair('smallTrays', 'smallSingles'), have.small)}
        {card('var(--large)', 'Large', `${bpt.large} / tray`, pair('largeTrays', 'largeSingles'), have.large)}
        {card(
          'var(--sic)',
          'Sicilian',
          'balls only',
          <div className="fields single">
            <CountField label="BALLS" formKey="sicSingles" fields={fields} onChange={onChange} synced={synced} />
          </div>,
          have.sic,
        )}
        {card(
          'var(--boli)',
          'Boli Dough',
          `target ${cfg.boliTargetTrays * bpt.boli} · ${bpt.boli} / tray`,
          pair('boliTrays', 'boliSingles'),
          have.boli,
          true,
        )}
      </div>
    </>
  );
}
