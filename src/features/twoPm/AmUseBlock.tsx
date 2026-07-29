import type { AmUseResult, SizeKey } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';
import { fmt } from './formState';

const ROWS: { key: SizeKey; name: string; color: string }[] = [
  { key: 'indi', name: 'INDI', color: 'var(--indi)' },
  { key: 'small', name: 'SM', color: 'var(--small)' },
  { key: 'large', name: 'LG', color: 'var(--large)' },
  { key: 'sic', name: 'SIC', color: 'var(--sic)' },
  { key: 'boil', name: 'BOIL', color: 'var(--boil)' },
];

/**
 * Morning-use readout. Appears only when yesterday's EON record exists —
 * that data arrives with storage in phase 4, so for now this stays hidden.
 */
export function AmUseBlock(props: { result: AmUseResult | null }) {
  if (!props.result) return null;
  const { amSales, amUse } = props.result;
  return (
    <>
      <SectionHead num="05" title="AM Use" note="SINCE LAST NIGHT" />
      <div className="card bysize">
        <div className="computed-row">
          <span className="label">AM SALES</span>
          <strong>{fmt(amSales)}</strong>
        </div>
        <table>
          <tbody>
            {ROWS.map(({ key, name, color }) => (
              <tr key={key}>
                <td className="size-name" style={{ ['--size' as string]: color }}>
                  <span className="dot" />
                  {name}
                </td>
                <td className={amUse[key] < 0 ? 'neg' : ''}>
                  {amUse[key]}
                  {amUse[key] < 0 && <span className="micro"> check count?</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
