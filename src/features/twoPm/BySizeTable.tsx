import { defaultConfig } from '../../config';
import type { BibleSizeKey, DoughDayRecord, PerSize } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';

const ROWS: { key: BibleSizeKey; name: string; color: string }[] = [
  { key: 'indi', name: 'INDI', color: 'var(--indi)' },
  { key: 'small', name: 'SM', color: 'var(--small)' },
  { key: 'large', name: 'LG', color: 'var(--large)' },
  { key: 'sic', name: 'SIC', color: 'var(--sic)' },
];

export function BySizeTable(props: {
  record: DoughDayRecord | null;
  have: PerSize;
  boilMake: number | null;
}) {
  const { record, have } = props;
  const cfg = defaultConfig;
  const dash = '—';

  return (
    <>
      <SectionHead num="04" title="By Size" note="TONIGHT → EON → TOMORROW" />
      <div className="card bysize">
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
              const shortage = record !== null && record.leftRaw[key] < 0;
              return (
                <tr key={key}>
                  <td className="size-name" style={{ ['--size' as string]: color }}>
                    <span className="dot" />
                    {name}
                  </td>
                  <td>
                    <strong>{have[key]}</strong>
                  </td>
                  <td>{record ? record.use[key] : dash}</td>
                  <td className={shortage ? 'neg' : ''}>
                    {record ? (shortage ? record.leftRaw[key] : record.left[key]) : dash}
                  </td>
                  <td>{record ? record.need[key] : dash}</td>
                  <td>{record ? record.make[key] : dash}</td>
                  <td className="trays-cell">
                    <div className="trays-box" style={{ ['--size' as string]: color }}>
                      {key === 'sic' ? (
                        <>
                          {record ? record.sicBalls : dash}
                          <span className="micro">BALLS</span>
                        </>
                      ) : record ? (
                        record.trays[key]
                      ) : (
                        dash
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="boil-row" style={{ ['--size' as string]: 'var(--boil)' }}>
          <span className="size-name" style={{ ['--size' as string]: 'var(--boil)' }}>
            <span className="dot" />
            <strong>BOIL</strong>
          </span>
          <span className="kv">
            <span className="micro">HAVE</span>
            <strong>{have.boil}</strong>
          </span>
          <span className="kv">
            <span className="micro">TARGET</span>
            <strong>{cfg.boilTargetTrays * cfg.ballsPerTray.boil}</strong>
          </span>
          <span className="kv">
            <span className="micro">MAKE</span>
            <strong>{props.boilMake === null ? dash : props.boilMake}</strong>
          </span>
          <span className="note">whole trays only</span>
        </div>

        {!record && (
          <p className="table-note">
            Fill in the counts, sales, and both forecasts to get tonight's make.
          </p>
        )}
      </div>
    </>
  );
}
