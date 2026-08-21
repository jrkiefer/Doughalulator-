import { defaultConfig } from '../../config';
import type { TempSlot } from '../../core';
import type { SyncStatus } from '../../services/sync';
import { Collapsible } from '../shared/Collapsible';

export type TempReadings = Record<TempSlot, Record<string, string>>;

export const emptyTempReadings: TempReadings = { morning: {}, midday: {}, night: {} };

const SLOT_ORDER: TempSlot[] = ['morning', 'midday', 'night'];

/**
 * Each station wears its own save chip, driven by the TEMPS record's own
 * state — never the whole date's, or a busy dough side would make a saved
 * temperature look unsaved (which is exactly what it used to do).
 */
function chip(state: SyncStatus['state']): { text: string; bad: boolean } | null {
  switch (state) {
    case 'synced':
      return { text: 'saved', bad: false };
    case 'saving':
    case 'syncing':
      return { text: 'saving…', bad: false };
    case 'offline':
      return { text: 'will retry', bad: false };
    case 'rejected':
    case 'unsaved':
      return { text: 'not saved', bad: true };
    default:
      return null;
  }
}

/**
 * Every reading is typed here and nowhere else. There is deliberately no way to
 * copy previous temperatures forward (owner's choice, Aug 2026): a temperature
 * log is a record of measurements actually taken, and pre-filling one with
 * yesterday's numbers is falsifying it — the exact thing an inspector looks for.
 */
export function TodayTemps(props: {
  slot: TempSlot;
  onSlot: (slot: TempSlot) => void;
  readings: TempReadings;
  onReading: (slot: TempSlot, station: string, value: string) => void;
  /** The temps record's own sync state for the open date. */
  state: SyncStatus['state'];
}) {
  const cfg = defaultConfig;
  const names = cfg.tempSlots.names;
  const slotLabel: Record<TempSlot, string> = {
    morning: names.morning,
    midday: names.midday,
    night: names.night,
  };
  const current = props.readings[props.slot];
  const chipFor = chip(props.state);

  return (
    <Collapsible id="temps" title="Today's temps" defaultOpen>
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
              {value.trim() !== '' && chipFor && (
                <span className={`chip${chipFor.bad ? ' bad' : ''}`}>{chipFor.text}</span>
              )}
            </div>
          </div>
        );
      })}
    </Collapsible>
  );
}
