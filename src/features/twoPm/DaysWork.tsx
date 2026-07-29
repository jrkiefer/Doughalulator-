import { defaultConfig } from '../../config';
import type { BatchOption, DoughDayRecord } from '../../core/types';
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

export function DaysWork(props: {
  record: DoughDayRecord | null;
  rounding: Rounding;
  onRounding: (r: 'down' | 'up') => void;
}) {
  const { record, rounding } = props;
  const chosen: BatchOption | null =
    record && rounding ? (rounding === 'down' ? record.batchDown : record.batchUp) : null;
  const trays = chosen ? chosen.finalTraysToMake : record?.trays ?? null;

  return (
    <>
      <SectionHead num="03" title="The Day's Work" note="TRAYS TO MAKE" />
      <div className="card">
        <span className="micro">TRAYS</span>
        <div className="tray-pills" style={{ marginTop: 10 }}>
          <TrayPill name="INDI" color="var(--indi)" value={trays ? String(trays.indi) : '—'} />
          <TrayPill name="SM" color="var(--small)" value={trays ? String(trays.small) : '—'} />
          <TrayPill name="LG" color="var(--large)" value={trays ? String(trays.large) : '—'} />
          <TrayPill
            name="SIC"
            color="var(--sic)"
            value={record ? `${record.sicBalls} BALLS` : '— BALLS'}
          />
          <TrayPill
            name="BOIL"
            color="var(--boil)"
            value={record ? String(record.boilTrays) : '—'}
          />
        </div>

        <hr className="dashed-divider" />

        {!record && (
          <p className="days-work-note">Set sales and both forecasts to get the batch count.</p>
        )}

        {record && !chosen && (
          <p className="days-work-note">
            <strong style={{ color: 'var(--ink)', fontSize: 15 }}>
              {batchesText(record.exactBatches)} batches · {record.totalTrays} trays
            </strong>
            <br />
            Tap Round up or Round down.
          </p>
        )}

        {record && chosen && (
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

        <div className="rounding-row">
          <span className="label">ROUNDING</span>
          <button
            className={`pill pill-sm${rounding === 'up' ? ' active' : ''}`}
            disabled={!record}
            onClick={() => props.onRounding('up')}
          >
            Round up
          </button>
          <button
            className={`pill pill-sm${rounding === 'down' ? ' active' : ''}`}
            disabled={!record}
            onClick={() => props.onRounding('down')}
          >
            Round down
          </button>
        </div>
      </div>
    </>
  );
}
