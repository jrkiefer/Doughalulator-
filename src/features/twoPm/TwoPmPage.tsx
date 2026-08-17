import type { DoughDayRecord, RoundDirection } from '../../core/types';
import { GraphsCard } from '../graphs/GraphsCard';
import { CountCards } from '../shared/CountCards';
import { BySizeTable } from './BySizeTable';
import { DaysWork } from './DaysWork';
import { SalesCard } from './SalesCard';
import type { TwoPmForm } from './formState';

export function TwoPmPage(props: {
  /** Computed in App from this form; always present (fields go null as needed). */
  record: DoughDayRecord;
  form: TwoPmForm;
  onFormChange: (patch: Partial<TwoPmForm>) => void;
  onRounding: (direction: RoundDirection) => void;
  onForecastRound: (direction: RoundDirection) => void;
  synced: boolean;
}) {
  const { form, record } = props;

  return (
    <>
      <div className="band">
        <SalesCard
          form={form}
          onChange={props.onFormChange}
          salesLeft={record.salesLeft}
          negativeSalesLeft={record.flags.negativeSalesLeft}
          forecastRound={record.rounding.forecast}
          forecastAuto={record.rounding.forecastAuto}
          slowDay={record.rounding.slowDay}
          onForecastRound={props.onForecastRound}
          synced={props.synced}
        />
        <CountCards
          fields={form}
          onChange={props.onFormChange}
          have={record.have}
          note="TRAYS + SINGLES"
          synced={props.synced}
        />
      </div>

      <div className="band">
        <DaysWork record={record} onRounding={props.onRounding} />
        <BySizeTable record={record} />
      </div>

      {/* Last on the page and shut by default: something to look at now and
          then, never part of the nightly count. */}
      <div className="band">
        <GraphsCard />
      </div>
    </>
  );
}
