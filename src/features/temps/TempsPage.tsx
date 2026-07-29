import { defaultConfig } from '../../config';
import type { TempSlot } from '../../core';
import { SectionHead } from '../shell/SectionHead';

export type TempReadings = Record<TempSlot, Record<string, string>>;

export const emptyTempReadings: TempReadings = { morning: {}, midday: {}, night: {} };

const SLOT_ORDER: TempSlot[] = ['morning', 'midday', 'night'];

export function TempsPage(props: {
  slot: TempSlot;
  onSlot: (slot: TempSlot) => void;
  readings: TempReadings;
  onReading: (slot: TempSlot, station: string, value: string) => void;
  onSave: () => void;
  saveMsg: string;
  onLoadLast: () => void;
  loadNote: string;
}) {
  const cfg = defaultConfig;
  const names = cfg.tempSlots.names;
  const slotLabel: Record<TempSlot, string> = {
    morning: names.morning,
    midday: names.midday,
    night: names.night,
  };
  const current = props.readings[props.slot];

  return (
    <div className="band">
      <SectionHead num="09" title="Station Temps" note="°F · 3× DAILY" />
      <div className="card">
        <div className="slot-chips">
          {SLOT_ORDER.map((slot) => (
            <button
              key={slot}
              className={`pill pill-sm${props.slot === slot ? ' active' : ''}`}
              onClick={() => props.onSlot(slot)}
            >
              {slotLabel[slot]}
            </button>
          ))}
        </div>

        {cfg.stations.map((station) => (
          <div className="temp-row" key={station}>
            <span className="label">{station}</span>
            <div className="temp-input">
              <input
                className="input"
                type="number"
                step="any"
                placeholder=""
                aria-label={`${station} temperature`}
                value={current[station] ?? ''}
                onChange={(e) => props.onReading(props.slot, station, e.target.value)}
              />
              <span className="suffix">°F</span>
            </div>
          </div>
        ))}

        <button className="pill pill-sm pill-block" onClick={props.onLoadLast}>
          LOAD LAST TEMPS
        </button>
        {props.loadNote && <div className="coming-note">{props.loadNote}</div>}
      </div>

      <div className="save-bar">
        <button
          className="btn-primary"
          disabled={!Object.values(current).some((v) => v.trim() !== '')}
          onClick={props.onSave}
        >
          SAVE TEMPS
        </button>
        <div className="coming-note">
          {Object.values(current).some((v) => v.trim() !== '')
            ? props.saveMsg
            : 'Type at least one temperature to save. Empty stations are skipped.'}
        </div>
      </div>
      <div style={{ height: 20 }} />
    </div>
  );
}
