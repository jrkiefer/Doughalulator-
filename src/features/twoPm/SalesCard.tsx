import { defaultConfig } from '../../config';
import { normalizeSales } from '../../core';
import type { Maybe, RoundDirection } from '../../core/types';
import { fmt, toNumOrNull } from '../shared/counts';
import { numericChangeHandler } from '../shared/inputs';
import { SectionHead } from '../shell/SectionHead';
import type { TwoPmForm } from './formState';
import { RoundingPills } from './RoundingPills';

/** Live "10 → $10,000" echo under a sales field. */
export function DollarEcho(props: { raw: string }) {
  const parsed = toNumOrNull(props.raw);
  if (parsed === null) return null;
  const expanded = normalizeSales(parsed, defaultConfig.salesShorthand);
  return (
    <div className="dollar-echo">
      {props.raw} → ${fmt(expanded)}
    </div>
  );
}

export function SalesCard(props: {
  form: TwoPmForm;
  onChange: (patch: Partial<TwoPmForm>) => void;
  salesLeft: Maybe;
  negativeSalesLeft: boolean;
  /** The direction the bible lookups are using tonight. */
  forecastRound: RoundDirection;
  forecastAuto: boolean;
  slowDay: boolean;
  onForecastRound: (direction: RoundDirection) => void;
  synced: boolean;
}) {
  const { form, onChange } = props;
  const field = (label: string, key: 'todayForecast' | 'currentSales' | 'tomorrowForecast') => (
    <div className="field-row">
      <span className="label">{label}</span>
      <div className="input-wrap">
        <input
          className="input"
          type="text"
          inputMode="decimal"
          aria-label={label}
          value={form[key]}
          onChange={numericChangeHandler({ decimal: true }, (value) => onChange({ [key]: value }))}
        />
        {props.synced && form[key].trim() !== '' && <span className="chip">saved</span>}
        <DollarEcho raw={form[key]} />
      </div>
    </div>
  );

  return (
    <>
      <SectionHead num="01" title="Sales & Forecast" note="10 = $10,000 · TOMORROW 0 = CLOSED" />
      <div className="card">
        {field("TODAY'S FORECAST", 'todayForecast')}
        {field('CURRENT SALES', 'currentSales')}
        <div className="computed-row">
          <span className="label">SALES LEFT TONIGHT</span>
          <strong>{props.salesLeft === null ? '—' : fmt(props.salesLeft)}</strong>
        </div>
        {props.negativeSalesLeft && (
          <div className="warning">
            Current sales are past tonight's forecast — check your numbers.
          </div>
        )}
        {field("TOMORROW'S FORECAST", 'tomorrowForecast')}

        <hr className="dashed-divider" />

        <RoundingPills
          label="FORECAST ROUNDING"
          active={props.forecastRound}
          isAuto={props.forecastAuto}
          onPick={props.onForecastRound}
        />
        <p className="days-work-note">
          {props.slowDay
            ? 'Quiet day — the bible rounds down where it can.'
            : 'The bible rounds up between rows.'}
        </p>
      </div>
    </>
  );
}
