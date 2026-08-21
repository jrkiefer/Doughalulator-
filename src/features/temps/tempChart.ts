/**
 * The temp line graph's data shaping — pure, so the alignment of readings
 * onto the shared time axis is provable rather than eyeballed.
 *
 * The x axis is TIME: the last few (date, slot) moments any station was read,
 * in slot order within the day. The y axis is a FIXED 28–50 °F scale split at
 * 40 — 28–40 is the fridge-safe zone, 40–50 the danger zone (owner's spec,
 * Aug 2026; their freezer runs ~32 °F so it fits the same scale). A reading
 * past either end is drawn as an arrow out of the plot, not silently clamped,
 * and anything above 50 also raises the red warning box beside the chart.
 */
import type { RecentTemps, TempReading } from '../../services/tempsService';

export const SCALE_MIN = 28;
export const SAFE_MAX = 40;
export const SCALE_MAX = 50;

export interface TimeColumn {
  date: string;
  slot: string;
}

/** Slot names exactly as the app writes them. */
const SLOT_ORDER = ['Morning', '2 PM', 'Night'];

/**
 * What the Log hands back, made speakable. The app writes the TEXT "2 PM",
 * but Google parses that cell as a time and displays it as "2:00 PM" — and
 * the read path is display values, so that is what arrives. Discovered
 * against the real sheet, Aug 2026; the fixture-fed tests never see it.
 */
export function normalizeSlot(slot: string): string {
  return slot.replace(/:00/g, '');
}

export function slotRank(slot: string): number {
  return SLOT_ORDER.indexOf(normalizeSlot(slot));
}

/**
 * The last `keep` distinct (date, slot) moments across every station,
 * oldest first. Stations read at different moments still share one axis.
 */
export function timeColumns(stations: RecentTemps, keep = 3): TimeColumn[] {
  const seen = new Map<string, TimeColumn>();
  for (const readings of Object.values(stations)) {
    for (const r of readings) {
      const slot = normalizeSlot(r.slot);
      seen.set(`${r.date}|${slot}`, { date: r.date, slot });
    }
  }
  return [...seen.values()]
    .sort((a, b) =>
      a.date === b.date ? slotRank(a.slot) - slotRank(b.slot) : a.date < b.date ? -1 : 1,
    )
    .slice(-keep);
}

/**
 * One station's temps aligned onto the shared columns; a moment the station
 * was not read is null — the line breaks there rather than inventing a value.
 * The LAST matching Log entry wins: a re-entered slot is a correction.
 */
export function stationSeries(
  readings: TempReading[],
  columns: TimeColumn[],
): (number | null)[] {
  return columns.map((c) => {
    for (let i = readings.length - 1; i >= 0; i--) {
      if (readings[i].date === c.date && normalizeSlot(readings[i].slot) === c.slot) {
        return readings[i].temp;
      }
    }
    return null;
  });
}

export interface OverLimit {
  station: string;
  temp: number;
  slot: string;
  date: string;
}

/**
 * Every loaded reading above the scale's top, for the warning box. Deliberately
 * NOT limited to the stations currently drawn: a temperature past 50 is a
 * food-safety fact, and a fact like that must not hide behind a pill.
 */
export function overLimitReadings(stations: RecentTemps): OverLimit[] {
  const hot: OverLimit[] = [];
  for (const [station, readings] of Object.entries(stations)) {
    for (const r of readings) {
      if (r.temp > SCALE_MAX) {
        hot.push({ station, temp: r.temp, slot: normalizeSlot(r.slot), date: r.date });
      }
    }
  }
  return hot;
}

export function fmtTemp(value: number): string {
  const shown = Number.isInteger(value) ? String(Math.abs(value)) : Math.abs(value).toFixed(1);
  return `${value < 0 ? '−' : ''}${shown}°`;
}
