import { defaultConfig, type BibleId } from '../../config';
import { runEonCalculation } from '../../core';
import type { BibleSizeKey, DoughDayRecord } from '../../core/types';
import { bibles } from '../../data/bibles';
import { CountCards } from '../shared/CountCards';
import { fmt, parseCounts, toNumOrNull } from '../shared/counts';
import { numericChangeHandler } from '../shared/inputs';
import { SectionHead } from '../shell/SectionHead';
import { DollarEcho } from '../twoPm/SalesCard';
import type { EonForm } from './formState';

const CHECK_ROWS: { key: BibleSizeKey; name: string }[] = [
  { key: 'indi', name: 'INDI' },
  { key: 'small', name: 'SM' },
  { key: 'large', name: 'LG' },
  { key: 'sic', name: 'SIC' },
];

export function EonPage(props: {
  date: string;
  bibleOverride: BibleId | undefined;
  dayRecord: DoughDayRecord | null;
  form: EonForm;
  onFormChange: (patch: Partial<EonForm>) => void;
  synced: boolean;
}) {
  const cfg = defaultConfig;
  const { form, dayRecord } = props;

  const record = runEonCalculation(
    {
      date: props.date,
      counts: parseCounts(form),
      finalSalesRaw: toNumOrNull(form.finalSales),
      manualTomorrowForecastRaw: toNumOrNull(form.manualTomorrowForecast),
      bibleOverride: props.bibleOverride,
    },
    dayRecord,
    bibles,
    cfg,
  );

  const needsManualForecast = !(dayRecord && dayRecord.tomorrowForecast !== null);
  const manualTyped = form.manualTomorrowForecast.trim() !== '';
  const shortSizes = record.traysShort
    ? CHECK_ROWS.filter(({ key }) => (record.traysShort![key] ?? 0) > 0)
    : [];
  const boliShort = (record.boliTraysShort ?? 0) > 0;
  const anyShort = shortSizes.length > 0 || boliShort;

  return (
    <>
      <div className="band">
        <SectionHead num="01" title="End of Night Sales" note="DOLLARS · 10 = $10,000" />
        <div className="card">
          <div className="field-row">
            <span className="label">FINAL SALES</span>
            <div className="input-wrap">
              <input
                className="input"
                type="text"
                inputMode="decimal"
                aria-label="FINAL SALES"
                value={form.finalSales}
                onChange={numericChangeHandler({ decimal: true }, (v) =>
                  props.onFormChange({ finalSales: v }),
                )}
              />
              {props.synced && form.finalSales.trim() !== '' && <span className="chip">saved</span>}
              <DollarEcho raw={form.finalSales} />
            </div>
          </div>
        </div>

        <CountCards
          fields={form}
          onChange={props.onFormChange}
          have={record.eonHave}
          note="CLOSING COUNT"
          synced={props.synced}
        />
      </div>

      <div className="band">
        <SectionHead num="08" title="EON Outlook" note="HAVE VS TOMORROW'S NEED" />
        <div className="card">
          {needsManualForecast && (
            <>
              <div className="field-row">
                <span className="label">
                  TOMORROW'S FORECAST
                  <span className="micro sublabel">
                    No 2 PM forecast — enter manually (0 = closed)
                  </span>
                </span>
                <div className="input-wrap">
                  <input
                    className="input"
                    type="text"
                    inputMode="decimal"
                    aria-label="TOMORROW'S FORECAST"
                    value={form.manualTomorrowForecast}
                    onChange={numericChangeHandler({ decimal: true }, (v) =>
                      props.onFormChange({ manualTomorrowForecast: v }),
                    )}
                  />
                  <DollarEcho raw={form.manualTomorrowForecast} />
                </div>
              </div>
              {!manualTyped && (
                <p className="days-work-note">Enter tomorrow's forecast above to see the outlook.</p>
              )}
            </>
          )}

          {record.flags.tomorrowCheckAvailable && record.flags.closedTomorrow && (
            <div className="closed-chip">Closed tomorrow — nothing needed.</div>
          )}

          {record.flags.tomorrowCheckAvailable && !record.flags.closedTomorrow && (
            <>
              {anyShort ? (
                <div className="verdict bad">
                  Short for tomorrow
                  <ul className="short-list">
                    {shortSizes.map(({ key, name }) => (
                      <li key={key}>
                        {name} —{' '}
                        {key === 'sic'
                          ? `${record.traysShort!.sic} ${record.traysShort!.sic === 1 ? 'tray' : 'trays'} (${record.sicBallsShort} balls) short`
                          : `${record.traysShort![key]} ${record.traysShort![key] === 1 ? 'tray' : 'trays'} short`}
                      </li>
                    ))}
                    {boliShort && <li>BOLI — {record.boliTraysShort} {record.boliTraysShort === 1 ? 'tray' : 'trays'} short of its {record.boliNeed}-ball target</li>}
                  </ul>
                </div>
              ) : (
                <div className="verdict ok">Covered for tomorrow</div>
              )}
            </>
          )}

          <hr className="dashed-divider" />

          <div className="computed-row">
            <span className="label">PM SALES</span>
            <strong>{record.pmSales === null ? '—' : fmt(record.pmSales)}</strong>
          </div>
          <p className="days-work-note spaced">
            Morning and evening dough use now live in the Google Sheet's “Dough Use” tab — it
            recomputes itself even when numbers are corrected by hand.
          </p>
        </div>
      </div>
    </>
  );
}
