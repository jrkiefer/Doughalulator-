/**
 * The By Size card: one row per bible size walking the night left to right —
 * HAVE → USE → LEFT → NEED → MAKE → PLAN → ROUND → FINAL — with the set-out
 * alert above it when tonight dips into tomorrow's dough, and the Boli row (a
 * top-up, never in the bible) styled to line its tray count up under FINAL.
 *
 * The last three columns are the batch rounding, told in the open: PLAN is
 * what the bible asked for, ROUND is what the batch rule added or trimmed to
 * reach whole mixer runs, and FINAL — the tinted column — is what actually
 * gets made. FINAL is the figure the Day's Work pills show, read from the same
 * `trayPlan` helper, so the two cards cannot disagree.
 *
 * Every figure is read off the engine's record; nothing is computed here.
 */
import { defaultConfig } from '../../config';
import type { BibleSizeKey, DoughDayRecord, Maybe } from '../../core/types';
import { fmtMaybe } from '../shared/counts';
import { SectionHead } from '../shell/SectionHead';
import { trayPlan } from './trayPlan';

const ROWS: { key: BibleSizeKey; name: string; label: string; color: string }[] = [
  { key: 'indi', name: 'INDI', label: 'Individual', color: 'var(--indi)' },
  { key: 'small', name: 'SM', label: 'Small', color: 'var(--small)' },
  { key: 'large', name: 'LG', label: 'Large', color: 'var(--large)' },
  // Sicilian is never set out — kept here only so every row has the same shape.
  { key: 'sic', name: 'SIC', label: 'Sicilian', color: 'var(--sic)' },
];

/**
 * The rounding cell: a true minus sign, and the colour language the Day's Work
 * status chip already speaks — red when the mixer is asked for more, green
 * when the night is trimmed. A counted size the rounding left alone reads a
 * plain 0; a size nobody counted has no rounding to report, so it stays "—".
 */
function RoundCell(props: { round: number; plan: Maybe }) {
  if (props.plan === null) return <td className="round-cell flat">—</td>;
  const { round } = props;
  const tone = round > 0 ? 'up' : round < 0 ? 'down' : 'flat';
  const text = round > 0 ? `+${round}` : round < 0 ? `−${-round}` : '0';
  return <td className={`round-cell ${tone}`}>{text}</td>;
}

export function BySizeTable(props: { record: DoughDayRecord }) {
  const { record } = props;
  const cfg = defaultConfig;
  const lines = trayPlan(record);

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
              <th>PLAN</th>
              <th>ROUND</th>
              <th>FINAL</th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map(({ key, name, color }) => {
              const left = record.left[key];
              const line = lines[key];
              // Sicilian is counted and made in loose balls, so its two tray
              // columns show balls — as this card and the pills always have.
              // It is never adjusted, so its plan and final are the same figure.
              const isSic = key === 'sic';
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
                  <td>{fmtMaybe(isSic ? record.sicBalls : line.plan)}</td>
                  <RoundCell round={line.round} plan={isSic ? record.sicBalls : line.plan} />
                  <td className="trays-cell" style={{ ['--size' as string]: color }}>
                    {isSic ? (
                      <>
                        {fmtMaybe(record.sicBalls)} <span className="micro">balls</span>
                      </>
                    ) : (
                      fmtMaybe(line.final)
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
          {/* Boli never absorbs a batch adjustment, so this IS its final tray
              count — which is why it needs no PLAN/ROUND of its own. */}
          <span className="boli-trays" style={{ ['--size' as string]: 'var(--boli)' }}>
            {fmtMaybe(lines.boli.final)}
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
