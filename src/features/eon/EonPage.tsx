import { defaultConfig, type BibleId } from '../../config';
import { runEonCalculation } from '../../core';
import type { BibleSizeKey, DoughDayRecord, SizeKey } from '../../core/types';
import { bibles } from '../bibleData';
import { CountCards } from '../shared/CountCards';
import { computeHave } from '../../core';
import { fmt, parseCounts, toNum } from '../shared/counts';
import { SectionHead } from '../shell/SectionHead';
import type { EonForm } from './formState';

const CHECK_ROWS: { key: BibleSizeKey; name: string }[] = [
  { key: 'indi', name: 'INDI' },
  { key: 'small', name: 'SM' },
  { key: 'large', name: 'LG' },
  { key: 'sic', name: 'SIC' },
];

const PM_USE_ROWS: { key: SizeKey; name: string; color: string }[] = [
  { key: 'indi', name: 'INDI', color: 'var(--indi)' },
  { key: 'small', name: 'SM', color: 'var(--small)' },
  { key: 'large', name: 'LG', color: 'var(--large)' },
  { key: 'sic', name: 'SIC', color: 'var(--sic)' },
  { key: 'boil', name: 'BOIL', color: 'var(--boil)' },
];

export function EonPage(props: {
  date: string;
  bibleOverride: BibleId | undefined;
  dayRecord: DoughDayRecord | null;
  form: EonForm;
  onFormChange: (patch: Partial<EonForm>) => void;
}) {
  const cfg = defaultConfig;
  const { form, dayRecord } = props;
  const counts = parseCounts(form);
  const eonHave = computeHave(counts, cfg);

  const manualTyped = form.manualTomorrowForecast.trim() !== '';
  const record = runEonCalculation(
    {
      date: props.date,
      counts,
      finalSalesRaw: toNum(form.finalSales),
      manualTomorrowForecastRaw: !dayRecord && manualTyped
        ? toNum(form.manualTomorrowForecast)
        : undefined,
      bibleOverride: props.bibleOverride,
    },
    dayRecord,
    bibles,
    cfg,
  );

  const shortSizes = record.eonLeft
    ? CHECK_ROWS.filter(({ key }) => record.eonLeft![key] < 0)
    : [];
  const finalSalesTyped = form.finalSales.trim() !== '';
  const roundingPending = dayRecord !== null && dayRecord.chosenBatchOption === null;

  return (
    <>
      <div className="band">
        <SectionHead num="01" title="End of Night Sales" note="DOLLARS" />
        <div className="card">
          <div className="field-row">
            <span className="label">FINAL SALES</span>
            <input
              className="input"
              inputMode="decimal"
              placeholder="0"
              aria-label="FINAL SALES"
              value={form.finalSales}
              onChange={(e) => props.onFormChange({ finalSales: e.target.value })}
            />
          </div>
        </div>

        <CountCards
          fields={form}
          onChange={props.onFormChange}
          have={eonHave}
          note="CLOSING COUNT"
        />
        <div style={{ height: 30 }} />
      </div>

      <div className="band band-dark">
        <SectionHead num="08" title="EON Outlook" note="HAVE VS TOMORROW'S NEED" />
        <div className="card">
          {!dayRecord && (
            <>
              <div className="field-row">
                <span className="label">
                  TOMORROW'S FORECAST
                  <span className="micro" style={{ display: 'block', marginTop: 4, textTransform: 'none' }}>
                    No 2 PM save — enter manually
                  </span>
                </span>
                <input
                  className="input"
                  inputMode="decimal"
                  placeholder="0"
                  aria-label="TOMORROW'S FORECAST"
                  value={form.manualTomorrowForecast}
                  onChange={(e) => props.onFormChange({ manualTomorrowForecast: e.target.value })}
                />
              </div>
              {!manualTyped && (
                <p className="days-work-note">Enter tomorrow's forecast above to see the outlook.</p>
              )}
            </>
          )}

          {record.flags.tomorrowCheckAvailable && (
            <>
              {shortSizes.length === 0 ? (
                <div className="verdict ok">Covered for tomorrow</div>
              ) : (
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
                  </ul>
                </div>
              )}
            </>
          )}

          <hr className="dashed-divider" />

          {dayRecord && (
            <div className="computed-row">
              <span className="label">PM SALES</span>
              <strong>{finalSalesTyped && record.pmSales !== null ? fmt(record.pmSales) : '—'}</strong>
            </div>
          )}

          {record.pmUse ? (
            <div className="bysize" style={{ marginTop: 12 }}>
              <span className="micro">PM USE — SINCE 2 PM</span>
              <table style={{ marginTop: 6 }}>
                <tbody>
                  {PM_USE_ROWS.map(({ key, name, color }) => (
                    <tr key={key}>
                      <td className="size-name" style={{ ['--size' as string]: color }}>
                        <span className="dot" />
                        {name}
                      </td>
                      <td className={record.pmUse![key] < 0 ? 'neg' : ''}>
                        {record.pmUse![key]}
                        {record.pmUse![key] < 0 && <span className="micro"> check count?</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="days-work-note" style={{ marginTop: 12 }}>
              {roundingPending
                ? 'PM Use needs a Round up / Round down choice on the 2 PM page.'
                : "PM Use needs today's 2 PM save."}
            </p>
          )}
        </div>

        <div className="save-bar">
          <button className="btn-primary" disabled>
            SAVE EON RECORD
          </button>
          <div className="coming-note">Saving comes in a later step.</div>
        </div>
      </div>
    </>
  );
}
