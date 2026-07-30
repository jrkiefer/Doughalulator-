import type { Bible } from '../../core/types';
import { Collapsible } from '../shared/Collapsible';

/** Read-only view of the active bible's table. Collapsed by default, remembered per session. */
export function BibleViewer(props: { bible: Bible }) {
  return (
    <section className="bible-viewer">
      <Collapsible
        id="bible"
        title={
          <span className="name">
            Dough <em>Bible</em>
          </span>
        }
      >
        <div className="micro" style={{ padding: '0 2px 10px' }}>
          {props.bible.name}
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: 'left' }}>SALES</th>
              <th>INDI</th>
              <th>SM</th>
              <th>LG</th>
              <th>SIC</th>
            </tr>
          </thead>
          <tbody>
            {props.bible.rows.map((row) => (
              <tr key={row.sales}>
                <td style={{ textAlign: 'left' }}>{row.sales.toLocaleString('en-US')}</td>
                <td>{row.indi}</td>
                <td>{row.small}</td>
                <td>{row.large}</td>
                <td>{row.sic}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Collapsible>
    </section>
  );
}
