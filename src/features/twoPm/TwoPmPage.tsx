/**
 * The whole 2 PM tab, top to bottom: sales + counts, the day's work, history,
 * the Dough Bible and the bible-comparison graph. App.tsx only decides WHICH
 * tab is showing.
 */
import type { DoughDayRecord, RoundDirection } from '../../core/types';
import { bibles } from '../../data/bibles';
import { BibleViewer } from '../bibleViewer/BibleViewer';
import { GraphsCard } from '../graphs/GraphsCard';
import { HistoryCard } from '../history/HistoryCard';
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
  onPickDate: (date: string) => void;
  synced: boolean;
}) {
  const { form, record } = props;

  return (
    <>
      <div className="band">
        {/* `tonightRowSales` is the row the engine landed on, and the three
            rounding values below it are the very ones the Dough Bible drawer
            is handed at the foot of this page — one switch, drawn twice. */}
        <SalesCard
          form={form}
          onChange={props.onFormChange}
          salesLeft={record.salesLeft}
          negativeSalesLeft={record.flags.negativeSalesLeft}
          tonightRowSales={record.tonightRowMatched?.sales ?? null}
          forecastRound={record.rounding.forecast}
          forecastAuto={record.rounding.forecastAuto}
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

      <HistoryCard onPick={props.onPickDate} />
      <BibleViewer
        bible={bibles[record.bibleUsed]}
        record={record}
        forecastRound={record.rounding.forecast}
        forecastAuto={record.rounding.forecastAuto}
        onForecastRound={props.onForecastRound}
      />
      {/* The graph drawer closes the page (owner's ask): a look-at-sometimes
          panel belongs after everything used on an ordinary night. */}
      <div className="band">
        <GraphsCard />
      </div>
    </>
  );
}
