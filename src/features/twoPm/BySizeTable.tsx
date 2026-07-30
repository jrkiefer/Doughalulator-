import { defaultConfig } from '../../config';
import type { BibleSizeKey, DoughDayRecord } from '../../core/types';
import { fmtMaybe } from '../shared/counts';
import { SectionHead } from '../shell/SectionHead';

const ROWS: { key: BibleSizeKey; name: string; color: string }[] = [
  { key: 'indi', name: 'INDI', color: 'var(--indi)' },
  { key: 'small', name: 'SM', color: 'var(--small)' },
  { key: 'large', name: 'LG', color: 'var(--large)' },
  { key: 'sic', name: 'SIC', color: 'var(--sic)' },
];

export function BySizeTable(props: { record: DoughDayRecord }) {
  const { record } = props;
  const cfg = defaultConfig;

  const setOuts = ROWS.filter(({ key }) => (record.setOutTrays[key] ?? 0) > 0);

  return (
    <>
      <SectionHead num="04" title="By Size" note="TONIGHT → EON → TOMORROW" />
      <div className="card bysize">
        {setOuts.length > 0 && (
          <div className="setout">
            <span className="label">SET OUT TONIGHT</span>
            <div className="setout-list">
              {setOuts.map(({ key, name, color }) => (
                <span key={key} className="tray-pill" style={{ ['--size' as string]: color }}>
                  <span className="dot" />
                  {name}{' '}
                  <strong>
                    {record.setOutTrays[key]} {record.setOutTrays[key] === 1 ? 'tray' : 'trays'}
                  </strong>
                  &nbsp;({record.setOutBalls[key]} balls)
                </span>
              ))}
            </div>
            <p className="days-work-note">
              Tonight will run past these counts — set the dough out now; tomorrow's make replaces it.
            </p>
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
            <strong>{fmtMaybe(record.boliTrays)}</strong>
          </span>
          <span className="note">
            {record.flags.boliNotCounted ? 'not counted' : 'whole trays only'}
          </span>
        </div>
      </div>
    </>
  );
}
