import { defaultConfig } from '../../config';
import type { BatchOption, DoughDayRecord, Maybe, RoundDirection } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';
import { RoundingPills } from './RoundingPills';

export type Rounding = 'down' | 'up' | null;

function trayWord(n: number): string {
  return `${n} ${n === 1 ? 'tray' : 'trays'}`;
}

/**
 * "+2 SM, +3 LG" / "−1 SM, −2 LG" — what Small and Large actually absorbed.
 *
 * Built from the trays that ended up on the bench, NOT from the requested
 * delta: a big round-down can ask a size to give up more trays than it has,
 * and `buildBatchOption` floors it at zero. Reporting the request would
 * promise a trim that never happened.
 */
function splitNote(small: number, large: number): string {
  const signed = (n: number) => (n > 0 ? `+${n}` : `−${-n}`);
  return [small !== 0 && `${signed(small)} SM`, large !== 0 && `${signed(large)} LG`]
    .filter(Boolean)
    .join(', ');
}

function TrayPill(props: { name: string; color: string; value: string }) {
  return (
    <span className="tray-pill" style={{ ['--size' as string]: props.color }}>
      <span className="dot" />
      {props.name} <strong>{props.value}</strong>
    </span>
  );
}

function pillValue(value: Maybe, suffix = ''): string {
  return value === null ? '—' : `${value}${suffix}`;
}

const SIZE_NAMES: Record<string, string> = {
  indi: 'Indi',
  small: 'Small',
  large: 'Large',
  sic: 'Sicilian',
  boli: 'Boli',
};

/** "Small and Large" / "Indi, Small and Large" — for naming what's missing. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/**
 * Which sizes are missing from the batch total. A size nobody has counted is
 * excluded from the maths rather than assumed to be zero — so the number on
 * screen is only about the sizes named here.
 */
function uncountedNames(record: DoughDayRecord): string[] {
  return (Object.keys(SIZE_NAMES) as (keyof typeof record.countedSizes)[])
    .filter((key) => !record.countedSizes[key])
    .map((key) => SIZE_NAMES[key]);
}

export function DaysWork(props: {
  record: DoughDayRecord;
  onRounding: (direction: RoundDirection) => void;
}) {
  const { record } = props;
  // The direction in force — tapped, or worked out by the remainder rule.
  const chosen: BatchOption | null =
    record.chosenBatchOption === null
      ? null
      : record.chosenBatchOption === 'down'
        ? record.batchDown
        : record.batchUp;
  const trays = chosen ? chosen.finalTraysToMake : { ...record.trays, boli: record.boliTrays };
  const closed = record.flags.closedTomorrow;
  const ready = record.totalTrays !== null;
  // How far the batch count moved off the plain plan, and where those trays
  // went. Small/Large deltas come from the FINAL trays so a floored round-down
  // reports what was really trimmed.
  const note = chosen
    ? splitNote(
        (chosen.finalTraysToMake.small ?? 0) - (record.trays.small ?? 0),
        (chosen.finalTraysToMake.large ?? 0) - (record.trays.large ?? 0),
      )
    : '';
  const tail = note ? ` · ${note}` : '';
  // Not ready splits two ways, and saying the wrong one is worse than saying
  // nothing: the sales card comes first on the page, so between filling it in
  // and counting the dough it is the COUNTS that are missing, not the sales.
  const salesKnown = record.salesLeft !== null && record.tomorrowForecast !== null;
  const missing = uncountedNames(record);

  return (
    <>
      <SectionHead num="03" title="The Day's Work" note="TRAYS TO MAKE" />
      <div className="card">
        <span className="micro">TRAYS</span>
        <div className="tray-pills">
          <TrayPill name="INDI" color="var(--indi)" value={pillValue(trays.indi)} />
          <TrayPill name="SM" color="var(--small)" value={pillValue(trays.small)} />
          <TrayPill name="LG" color="var(--large)" value={pillValue(trays.large)} />
          <TrayPill name="SIC" color="var(--sic)" value={pillValue(record.sicBalls, ' BALLS')} />
          <TrayPill name="BOLI" color="var(--boli)" value={pillValue(record.boliTrays)} />
        </div>
        {missing.length > 0 && missing.length < 5 && (
          <p className="days-work-note">
            {listNames(missing)} {missing.length === 1 ? "isn't" : "aren't"} counted — left out of
            tonight's batch.
          </p>
        )}

        <hr className="dashed-divider" />

        {closed && (
          <div className="closed-chip">
            Closed tomorrow — nothing to make tonight.
          </div>
        )}

        {!closed && !ready && (
          <p className="days-work-note">
            {salesKnown
              ? 'Count the dough above to get the batch count.'
              : 'Set sales and both forecasts to get the batch count.'}
          </p>
        )}

        {!closed && ready && record.totalTrays === 0 && (
          <p className="days-work-note">Nothing to make — tomorrow is covered by what's left.</p>
        )}

        {!closed && ready && chosen && (
          <div className="batch-hero">
            <div className="numeral">{chosen.batches}</div>
            <div className="details">
              <div className="micro">BATCHES</div>
              <h3>
                {chosen.batches} {chosen.batches === 1 ? 'batch' : 'batches'} to make
              </h3>
              <div className="kv">
                <span className="micro">PLANNED</span>
                <strong>{trayWord(record.totalTrays!)}</strong>
              </div>
              <div className="kv">
                <span className="micro">MAKING</span>
                <strong>
                  {trayWord(chosen.targetTrays)} ({chosen.batches} ×{' '}
                  {defaultConfig.traysPerBatch})
                </strong>
              </div>
              <span
                className={`status-chip${
                  chosen.trayDelta > 0 ? ' up' : chosen.trayDelta < 0 ? ' down' : ''
                }`}
              >
                {chosen.trayDelta > 0
                  ? `▴ rounded up · +${trayWord(chosen.trayDelta)}${tail}`
                  : chosen.trayDelta < 0
                    ? `▾ rounded down ${trayWord(-chosen.trayDelta)}${tail}`
                    : `even · ${trayWord(record.totalTrays!)} = ${chosen.batches} ${
                        chosen.batches === 1 ? 'batch' : 'batches'
                      }`}
              </span>
            </div>
          </div>
        )}

        {!closed && ready && record.totalTrays! > 0 && (
          <RoundingPills
            label="BATCH ROUNDING"
            active={record.rounding.batches}
            isAuto={record.rounding.batchesAuto}
            onPick={props.onRounding}
          />
        )}
      </div>
    </>
  );
}
