import { defaultConfig } from '../../config';
import type { BatchOption, DoughDayRecord, Maybe } from '../../core/types';
import { SectionHead } from '../shell/SectionHead';

export type Rounding = 'down' | 'up' | null;

function batchesText(exact: number): string {
  return Number.isInteger(exact) ? String(exact) : exact.toFixed(1);
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

export function DaysWork(props: {
  record: DoughDayRecord;
  rounding: Rounding;
  onRounding: (r: 'down' | 'up') => void;
}) {
  const { record, rounding } = props;
  const chosen: BatchOption | null =
    rounding === null ? null : rounding === 'down' ? record.batchDown : record.batchUp;
  const trays = chosen ? chosen.finalTraysToMake : { ...record.trays, boli: record.boliTrays };
  const closed = record.flags.closedTomorrow;
  const ready = record.totalTrays !== null;

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
        {record.flags.boliNotCounted && (
          <p className="days-work-note">Boli wasn't counted — it's left out of tonight's batch.</p>
        )}

        <hr className="dashed-divider" />

        {closed && (
          <div className="closed-chip">
            Closed tomorrow — nothing to make tonight.
          </div>
        )}

        {!closed && !ready && (
          <p className="days-work-note">Set sales and both forecasts to get the batch count.</p>
        )}

        {!closed && ready && record.totalTrays === 0 && (
          <p className="days-work-note">Nothing to make — tomorrow is covered by what's left.</p>
        )}

        {!closed && ready && record.totalTrays! > 0 && !chosen && (
          <p className="days-work-note">
            <strong className="lede">
              {batchesText(record.exactBatches!)} batches · {record.totalTrays} trays
            </strong>
            <br />
            Tap Round up or Round down.
          </p>
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
                <strong>{record.totalTrays} trays</strong>
              </div>
              <div className="kv">
                <span className="micro">MAKING</span>
                <strong>
                  {chosen.targetTrays} trays ({chosen.batches} × {defaultConfig.traysPerBatch})
                </strong>
              </div>
              <span className="status-chip">
                {chosen.trayDelta === 0
                  ? `even · ${record.totalTrays} trays = ${chosen.batches} batches`
                  : chosen.trayDelta > 0
                    ? `rounded up from ${record.totalTrays}`
                    : `rounded down from ${record.totalTrays}`}
              </span>
            </div>
          </div>
        )}

        {!closed && ready && record.totalTrays! > 0 && (
          <div className="rounding-row">
            <span className="label">ROUNDING</span>
            <button
              className={`pill pill-sm${rounding === 'up' ? ' active' : ''}`}
              onClick={() => props.onRounding('up')}
            >
              Round up
            </button>
            <button
              className={`pill pill-sm${rounding === 'down' ? ' active' : ''}`}
              onClick={() => props.onRounding('down')}
            >
              Round down
            </button>
          </div>
        )}
      </div>
    </>
  );
}
