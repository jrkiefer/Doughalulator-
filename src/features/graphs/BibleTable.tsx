/**
 * The graph's numbers as a table.
 *
 * Not decoration: a value you can only get by touching a chart is a value some
 * people cannot get at all. Everything the crosshair shows is here in plain
 * figures, and the difference column saves the reader doing the subtraction.
 */
import { fmt } from '../shared/counts';

export interface TableRow {
  sales: number;
  now: number | null;
  suggested: number | null;
}

function cell(value: number | null): string {
  if (value === null) return '—';
  return Number.isInteger(value) ? fmt(value) : value.toFixed(2);
}

/** Signed, with a true minus — matches the EON outlook's wording. */
function diffCell(row: TableRow): string {
  if (row.now === null || row.suggested === null) return '—';
  const diff = Number((row.suggested - row.now).toFixed(2));
  if (diff === 0) return 'same';
  const shown = Number.isInteger(diff) ? String(Math.abs(diff)) : Math.abs(diff).toFixed(2);
  return `${diff > 0 ? '+' : '−'}${shown}`;
}

export function BibleTable(props: { rows: TableRow[]; unit: string }) {
  return (
    <div className="chart-table">
      <table>
        <thead>
          <tr>
            <th className="left">SALES</th>
            <th>NOW</th>
            <th>NEW</th>
            <th>DIFF</th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row) => {
            const diff =
              row.now !== null && row.suggested !== null ? row.suggested - row.now : null;
            return (
              <tr key={row.sales}>
                <td className="left">{fmt(row.sales)}</td>
                <td>{cell(row.now)}</td>
                <td>{cell(row.suggested)}</td>
                <td className={diff === null || diff === 0 ? '' : diff > 0 ? 'up' : 'down'}>
                  {diffCell(row)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="days-work-note">Figures in {props.unit.toLowerCase()}.</p>
    </div>
  );
}
