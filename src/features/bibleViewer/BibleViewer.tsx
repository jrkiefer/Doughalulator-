import { defaultConfig } from '../../config';
import { lookupBibleRow } from '../../core';
import type { Bible, DoughDayRecord, RoundDirection } from '../../core/types';
import { Collapsible } from '../shared/Collapsible';
import { RoundingPills } from '../twoPm/RoundingPills';

/**
 * The rows tonight's figures land on, so the table answers "which line are we
 * on" at a glance: ←TONIGHT is today's whole forecast, ←LEFT is the selling
 * still to come (the row the use lookup actually reads — the engine already
 * recorded it), ←TMRW is tomorrow's need. One row can carry more than one.
 */
function rowTags(record: DoughDayRecord, bible: Bible): Map<number, string[]> {
  const tags = new Map<number, string[]>();
  const add = (sales: number | undefined, label: string) => {
    if (sales === undefined) return;
    tags.set(sales, [...(tags.get(sales) ?? []), label]);
  };
  // Not stored on the record — the whole-forecast row is context, not maths —
  // but the same pure lookup, with the night's own rounding direction.
  const tonight =
    record.todayForecast === null
      ? null
      : lookupBibleRow(bible, record.todayForecast, defaultConfig, record.rounding.forecast);
  add(tonight?.sales, 'TONIGHT');
  add(record.tonightRowMatched?.sales, 'LEFT');
  add(record.tomorrowRowMatched?.sales, 'TMRW');
  return tags;
}

/** The strongest tag decides the row's tint: tomorrow's make outranks tonight. */
function rowClass(labels: string[] | undefined): string {
  if (!labels) return '';
  if (labels.includes('TMRW')) return 'mark-tmrw';
  if (labels.includes('LEFT')) return 'mark-left';
  return 'mark-tonight';
}

/**
 * The active bible's table, with the forecast-rounding pills above it — the
 * rounding IS a bible matter (which row a lookup lands on), and this is where
 * the owner's other app has always kept it. Collapsed by default.
 */
export function BibleViewer(props: {
  bible: Bible;
  record: DoughDayRecord;
  forecastRound: RoundDirection;
  forecastAuto: boolean;
  onForecastRound: (direction: RoundDirection) => void;
}) {
  const tags = rowTags(props.record, props.bible);

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
        {/* The AUTO tag teaches the rule only when the rule actually fired:
            "SLOW DAY = DOWN" beside a highlighted Round UP pill read as a
            contradiction, so an ordinary night just says AUTO. */}
        <RoundingPills
          label="ROUNDING"
          active={props.forecastRound}
          isAuto={props.forecastAuto}
          autoText={props.forecastRound === 'down' ? 'AUTO · SLOW DAY = DOWN' : undefined}
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
            {props.bible.rows.map((row) => {
              const labels = tags.get(row.sales);
              return (
                <tr key={row.sales} className={rowClass(labels)}>
                  <td className="left">
                    {row.sales.toLocaleString('en-US')}
                    {labels && (
                      <span className={`bible-tag${labels.includes('TMRW') ? ' tmrw' : ''}`}>
                        ←{labels.join(' · ')}
                      </span>
                    )}
                  </td>
                  <td>{row.indi}</td>
                  <td>{row.small}</td>
                  <td>{row.large}</td>
                  <td>{row.sic}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Collapsible>
    </section>
  );
}
