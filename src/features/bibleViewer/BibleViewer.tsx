import type { Bible, RoundDirection } from '../../core/types';
import { Collapsible } from '../shared/Collapsible';
import { RoundingPills } from '../twoPm/RoundingPills';

/**
 * The active bible's table, with the forecast-rounding pills above it — the
 * rounding IS a bible matter (which row a lookup lands on), and this is where
 * the owner's other app has always kept it. Collapsed by default.
 */
export function BibleViewer(props: {
  bible: Bible;
  forecastRound: RoundDirection;
  forecastAuto: boolean;
  onForecastRound: (direction: RoundDirection) => void;
}) {
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
        <div className="micro bible-name">
          {props.bible.name}
        </div>
        <RoundingPills
          label="ROUNDING"
          active={props.forecastRound}
          isAuto={props.forecastAuto}
          autoText="AUTO · SLOW DAY = DOWN"
          onPick={props.onForecastRound}
        />
        <table>
          <thead>
            <tr>
              <th className="left">SALES</th>
              <th>INDI</th>
              <th>SM</th>
              <th>LG</th>
              <th>SIC</th>
            </tr>
          </thead>
          <tbody>
            {props.bible.rows.map((row) => (
              <tr key={row.sales}>
                <td className="left">{row.sales.toLocaleString('en-US')}</td>
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
