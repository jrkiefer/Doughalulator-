/**
 * The sales card: today's forecast, current sales, the computed sales-left
 * line between them, tomorrow's forecast, and — at the foot — the night's
 * bible rounding. The three inputs hold RAW strings (blank ≠ zero survives
 * the form); every derived number on this card comes back down from the
 * engine's record, never re-computed here.
 */
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
  /**
   * The bible row the engine's sales-left look-up actually landed on
   * (`record.tonightRowMatched`), already unwrapped to its sales figure.
   * Null far more often than it looks: either sales field still blank,
   * nothing left to sell, or sales already past the forecast — in all of
   * which the engine makes no look-up at all. Handed down rather than
   * looked up again here, so this line and the ←LEFT tag in the Dough Bible
   * drawer cannot end up pointing at different rows of the same book.
   */
  tonightRowSales: Maybe;
  /** The direction BOTH bible look-ups are using tonight, and who chose it. */
  forecastRound: RoundDirection;
  forecastAuto: boolean;
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
      {/* Just the one rule typing never teaches: the dollar echo under each
          field already shows "15 → $15,000" as it is typed. */}
      <SectionHead num="01" title="Sales & Forecast" note="TOMORROW 0 = CLOSED" />
      <div className="card">
        {field("TODAY'S FORECAST", 'todayForecast')}
        {field('CURRENT SALES', 'currentSales')}
        <div className="computed-row">
          <span className="label">SALES LEFT TONIGHT</span>
          {/* The selling still to come, and under it the line of the bible
              that figure is read against — the two stack so they land as one
              answer. The words are "BIBLE ROW", never "rounded to": only
              sometimes is it rounding at all. A figure sitting exactly on a
              row moves nowhere, below the book's first row and above its
              last it CLAMPS in either direction, and a round-down of more
              than $400 quietly takes the row ABOVE instead. One neutral
              phrase is true on every one of those nights. */}
          <span className="figure">
            <strong>{props.salesLeft === null ? '—' : fmt(props.salesLeft)}</strong>
            {props.tonightRowSales !== null && (
              <span className="rounds-to">BIBLE ROW {fmt(props.tonightRowSales)}</span>
            )}
          </span>
        </div>
        {props.negativeSalesLeft && (
          <div className="warning">
            Current sales are past tonight's forecast — check your numbers.
          </div>
        )}
        {field("TOMORROW'S FORECAST", 'tomorrowForecast')}
        {/* The night's bible rounding — the SAME switch the Dough Bible
            drawer carries, reading the same record field and calling the same
            handler, so a tap here and a tap there are one decision. It earns a
            second home because the row it decides is printed just above, while
            the drawer sits at the very bottom of the page.

            Plain AUTO, not the drawer's "AUTO · SLOW DAY = DOWN": that tag is
            142.6px, and label + tag + pills would run to 417px against the
            332px this card has at 390px. The drawer keeps the long form. */}
        <RoundingPills
          label="ROUNDING"
          active={props.forecastRound}
          isAuto={props.forecastAuto}
          onPick={props.onForecastRound}
        />
      </div>
    </>
  );
}
