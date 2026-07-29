import { useState } from 'react';
import type { Bible } from '../../core/types';

/** Read-only view of the active bible's table, collapsed by default. */
export function BibleViewer(props: { bible: Bible }) {
  const [open, setOpen] = useState(false);
  return (
    <section className="bible-viewer">
      <button className="bar" onClick={() => setOpen(!open)}>
        <span className="name">
          Dough <em>Bible</em>
        </span>
        <span className="micro">{open ? 'TAP TO COLLAPSE ▲' : 'TAP TO EXPAND ▼'}</span>
      </button>
      {open && (
        <>
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
        </>
      )}
    </section>
  );
}
