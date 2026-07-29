import { SectionHead } from '../shell/SectionHead';
import { fmt, type TwoPmForm } from './formState';

export function SalesCard(props: {
  form: TwoPmForm;
  onChange: (patch: Partial<TwoPmForm>) => void;
  salesLeft: number | null;
  negativeSalesLeft: boolean;
}) {
  const { form, onChange } = props;
  const field = (label: string, key: 'todayForecast' | 'currentSales' | 'tomorrowForecast') => (
    <div className="field-row">
      <span className="label">{label}</span>
      <input
        className="input"
        inputMode="decimal"
        placeholder="0"
        aria-label={label}
        value={form[key]}
        onChange={(e) => onChange({ [key]: e.target.value })}
      />
    </div>
  );

  return (
    <>
      <SectionHead num="01" title="Sales & Forecast" note="10 = $10,000" />
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
      </div>
    </>
  );
}
