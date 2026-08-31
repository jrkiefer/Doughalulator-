/**
 * The By Size card: one row per bible size walking the night left to right —
 * HAVE → USE → LEFT → NEED → MAKE → TRAYS — with the set-out alert above it
 * when tonight dips into tomorrow's dough, and the Boli row (a top-up, never
 * in the bible) styled to line its tray count up under the TRAYS column.
 * Every figure is read off the engine's record; nothing is computed here.
 */
import { defaultConfig } from '../../config';
import type { BibleSizeKey, DoughDayRecord } from '../../core/types';
import { fmtMaybe } from '../shared/counts';
import { SectionHead } from '../shell/SectionHead';

const ROWS: { key: BibleSizeKey; name: string; label: string; color: string }[] = [
  { key: 'indi', name: 'INDI', label: 'Individual', color: 'var(--indi)' },
  { key: 'small', name: 'SM', label: 'Small', color: 'var(--small)' },
  { key: 'large', name: 'LG', label: 'Large', color: 'var(--large)' },
  // Sicilian is never set out — kept here only so every row has the same shape.
  { key: 'sic', name: 'SIC', label: 'Sicilian', color: 'var(--sic)' },
];

export function BySizeTable(props: { record: DoughDayRecord }) {
  const { record } = props;
  const cfg = defaultConfig;

  const setOuts = ROWS.filter(({ key }) => (record.setOutTrays[key] ?? 0) > 0);
  // Boli's make in balls. The record only carries trays, and whole trays are
  // all it ever makes, so the balls are exactly trays × 6.
  const boliMakeBalls =
    record.boliTrays === null ? null : record.boliTrays * cfg.ballsPerTray.boli;

  return (
    <>
      <SectionHead num="04" title="By Size" note="TONIGHT → EON → TOMORROW" />
      <div className="card bysize">
        {setOuts.length > 0 && (
          <div className="setout">
            <span className="label">Set out now — tonight dips into same-day dough</span>
            <div className="setout-list">
              {setOuts.map(({ key, label }) => (
                <span key={key}>
                  {label}: {record.setOutTrays[key]}{' '}
                  {record.setOutTrays[key] === 1 ? 'tray' : 'trays'}
                </span>
              ))}
            </div>
          </div>
        )}

        <table>
          <thead>
            <tr>
              <th />
              <th>HAVE</th>
              <th>USE</th>
              <th>LEFT</th>
              <th>NEED</th>
              <th>MAKE</th>
              <th>TRAYS</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, name, color }) => {
              const left = record.left[key];
              return (
                <tr key={key}>
                  <td className="size-name" style={{ ['--size' as string]: color }}>
                    <span className="dot" />
                    {name}
                  </td>
                  <td>
                    <strong>{fmtMaybe(record.have[key])}</strong>
                  </td>
                  <td>{fmtMaybe(record.use[key])}</td>
                  <td className={left !== null && left < 0 ? 'neg' : ''}>{fmtMaybe(left)}</td>
                  <td>{fmtMaybe(record.need[key])}</td>
                  <td>{fmtMaybe(record.make[key])}</td>
                  <td className="trays-cell" style={{ ['--size' as string]: color }}>
                    {key === 'sic' ? (
                      <>
                        {fmtMaybe(record.sicBalls)} <span className="micro">balls</span>
                      </>
                    ) : (
                      fmtMaybe(record.trays[key])
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="boli-row" style={{ ['--size' as string]: 'var(--boli)' }}>
          <span className="size-name" style={{ ['--size' as string]: 'var(--boli)' }}>
            <span className="dot" />
            <strong>BOLI</strong>
          </span>
          <span className="kv">
            <span className="micro">HAVE</span>
            <strong>{fmtMaybe(record.have.boli)}</strong>
          </span>
          <span className="kv">
            <span className="micro">TARGET</span>
            <strong>{record.flags.closedTomorrow ? 0 : cfg.boliTargetTrays * cfg.ballsPerTray.boli}</strong>
          </span>
          <span className="kv">
            <span className="micro">MAKE</span>
            {/* Balls, like HAVE and TARGET beside it — the trays are the cell
                on the right, where every other size's trays sit. */}
            <strong>{fmtMaybe(boliMakeBalls)}</strong>
          </span>
          <span className="boli-trays" style={{ ['--size' as string]: 'var(--boli)' }}>
            {fmtMaybe(record.boliTrays)}
          </span>
          {/* Only when there is something to say. "Whole trays only" was
              explaining a rule the row already shows; "not counted" is real
              news about tonight — it means Boli is out of the batch total. */}
          {record.flags.boliNotCounted && <span className="note">not counted</span>}
        </div>
      </div>
    </>
  );
}
