/**
 * The whole Station Temps tab, top to bottom: today's inputs, the per-station
 * history, and the temp graph. Everything temps lives in this folder —
 * App.tsx only decides WHICH tab is showing.
 */
import type { TempSlot } from '../../core';
import type { SyncStatus } from '../../services/sync';
import { SectionHead } from '../shell/SectionHead';
import { TempGraph } from './TempGraph';
import { TempHistory } from './TempHistory';
import { TodayTemps, type TempReadings } from './TodayTemps';

export { emptyTempReadings, type TempReadings } from './TodayTemps';

export function TempsPage(props: {
  slot: TempSlot;
  onSlot: (slot: TempSlot) => void;
  readings: TempReadings;
  onReading: (slot: TempSlot, station: string, value: string) => void;
  /** The temps record's own sync state for the open date. */
  state: SyncStatus['state'];
}) {
  return (
    <>
      <div className="band">
        <SectionHead num="09" title="Station Temps" note="°F · 3× DAILY · SAVES BY ITSELF" />
        <TodayTemps
          slot={props.slot}
          onSlot={props.onSlot}
          readings={props.readings}
          onReading={props.onReading}
          state={props.state}
        />
      </div>
      <TempHistory />
      <div className="band">
        <TempGraph />
      </div>
    </>
  );
}
