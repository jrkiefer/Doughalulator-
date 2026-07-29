import { defaultConfig, type BibleId } from '../../config';
import { computeHave, normalizeSales, runDoughCalculation } from '../../core';
import { bibles } from '../bibleData';
import { AmUseBlock } from './AmUseBlock';
import { BySizeTable } from './BySizeTable';
import { DaysWork, type Rounding } from './DaysWork';
import { SalesCard } from './SalesCard';
import { CountCards } from './CountCards';
import { parseCounts, salesComplete, toNum, type TwoPmForm } from './formState';

export function TwoPmPage(props: {
  date: string;
  bibleOverride: BibleId | undefined;
  form: TwoPmForm;
  onFormChange: (patch: Partial<TwoPmForm>) => void;
  rounding: Rounding;
  onRounding: (r: 'down' | 'up') => void;
}) {
  const cfg = defaultConfig;
  const { form } = props;
  const counts = parseCounts(form);
  const have = computeHave(counts, cfg);

  const record = salesComplete(form)
    ? runDoughCalculation(
        {
          date: props.date,
          counts,
          todayForecastRaw: toNum(form.todayForecast),
          currentSalesRaw: toNum(form.currentSales),
          tomorrowForecastRaw: toNum(form.tomorrowForecast),
          bibleOverride: props.bibleOverride,
        },
        bibles,
        cfg,
      )
    : null;

  // Sales-left preview as soon as today's forecast + current sales are both typed.
  const salesPairTyped = form.todayForecast.trim() !== '' && form.currentSales.trim() !== '';
  const salesLeft = record
    ? record.salesLeft
    : salesPairTyped
      ? normalizeSales(toNum(form.todayForecast), cfg.salesShorthand) -
        normalizeSales(toNum(form.currentSales), cfg.salesShorthand)
      : null;

  return (
    <>
      <div className="band">
        <SalesCard
          form={form}
          onChange={props.onFormChange}
          salesLeft={salesLeft}
          negativeSalesLeft={salesLeft !== null && salesLeft < 0}
        />
        <CountCards form={form} onChange={props.onFormChange} have={have} />
        <div style={{ height: 30 }} />
      </div>

      <div className="band band-dark">
        <DaysWork record={record} rounding={props.rounding} onRounding={props.onRounding} />
        <BySizeTable
          record={record}
          have={have}
          boilMake={record ? record.boilTrays : null}
        />
        <AmUseBlock result={null} />
        <div className="save-bar">
          <button className="btn-primary" disabled>
            SAVE 2 PM RECORD
          </button>
          <div className="coming-note">
            {props.rounding === null && record !== null
              ? 'Tap Round up or Round down first — saving itself comes in a later step.'
              : 'Saving comes in a later step.'}
          </div>
        </div>
      </div>
    </>
  );
}
