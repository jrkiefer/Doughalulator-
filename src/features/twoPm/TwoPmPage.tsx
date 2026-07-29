import { defaultConfig } from '../../config';
import { normalizeSales } from '../../core';
import type { AmUseResult, DoughDayRecord, PerSize } from '../../core/types';
import { AmUseBlock } from './AmUseBlock';
import { BySizeTable } from './BySizeTable';
import { DaysWork, type Rounding } from './DaysWork';
import { SalesCard } from './SalesCard';
import { CountCards } from '../shared/CountCards';
import { toNum, type TwoPmForm } from './formState';

export function TwoPmPage(props: {
  /** Computed in App from this form (null until sales + both forecasts are typed). */
  record: DoughDayRecord | null;
  have: PerSize;
  form: TwoPmForm;
  onFormChange: (patch: Partial<TwoPmForm>) => void;
  rounding: Rounding;
  onRounding: (r: 'down' | 'up') => void;
  amUse: AmUseResult | null;
  onSave: () => void;
  saveMsg: string;
}) {
  const cfg = defaultConfig;
  const { form, record, have } = props;

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
        <CountCards fields={form} onChange={props.onFormChange} have={have} note="TRAYS + SINGLES" />
        <div style={{ height: 30 }} />
      </div>

      <div className="band band-dark">
        <DaysWork record={record} rounding={props.rounding} onRounding={props.onRounding} />
        <BySizeTable record={record} have={have} boilMake={record ? record.boilTrays : null} />
        <AmUseBlock result={props.amUse} />
        <div className="save-bar">
          <button
            className="btn-primary"
            disabled={record === null || props.rounding === null}
            onClick={props.onSave}
          >
            SAVE 2 PM RECORD
          </button>
          <div className="coming-note">
            {record === null
              ? 'Fill in the sales and forecasts to save.'
              : props.rounding === null
                ? 'Tap Round up or Round down first.'
                : props.saveMsg}
          </div>
        </div>
      </div>
    </>
  );
}
