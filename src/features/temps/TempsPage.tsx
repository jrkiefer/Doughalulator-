import { defaultConfig } from '../../config';
import type { TempSlot } from '../../core';
import { Collapsible } from '../shared/Collapsible';
import { TempGraph } from './TempGraph';
import { SectionHead } from '../shell/SectionHead';

export type TempReadings = Record<TempSlot, Record<string, string>>;

export const emptyTempReadings: TempReadings = { morning: {}, midday: {}, night: {} };

const SLOT_ORDER: TempSlot[] = ['morning', 'midday', 'night'];

/**
 * Every reading is typed here and nowhere else. There is deliberately no way to
 * copy previous temperatures forward (owner's choice, Aug 2026): a temperature
 * log is a record of measurements actually taken, and pre-filling one with
 * yesterday's numbers is falsifying it — the exact thing an inspector looks for.
 */
export function TempsPage(props: {
  slot: TempSlot;
  onSlot: (slot: TempSlot) => void;
  readings: TempReadings;
  onReading: (slot: TempSlot, station: string, value: string) => void;
  synced: boolean;
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
      <SectionHead num="09" title="Station Temps" note="°F · 3× DAILY · SAVES BY ITSELF" />
      <Collapsible id="temps" title="Today's temps">
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

        {cfg.stations.map((station) => {
          const value = current[station] ?? '';
          return (
            <div className="temp-row" key={station}>
              <span className="label">{station}</span>
              <div className="temp-input">
                <input
                  className="input"
                  type="number"
                  step="any"
                  aria-label={`${station} temperature`}
                  value={value}
                  onChange={(e) => props.onReading(props.slot, station, e.target.value)}
                />
                <span className="suffix">°F</span>
                {props.synced && value.trim() !== '' && <span className="chip">saved</span>}
              </div>
            </div>
          );
        })}
      </Collapsible>

      {/* The last few readings per station, drawn. Shut by default and loads
          nothing until asked, so a normal reading round costs what it did. */}
      <TempGraph />
    </div>
  );
}
