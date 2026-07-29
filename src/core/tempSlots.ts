import type { AppConfig } from '../config';

export type TempSlot = 'morning' | 'midday' | 'night';

/**
 * Which temps slot a clock time belongs to. Time is 'HH:MM' (24h, zero-padded),
 * passed in — core never reads the clock. Before 11:00 → morning;
 * 11:00–17:00 inclusive → midday (the 2 PM slot); after 17:00 → night.
 */
export function slotForTime(time: string, config: AppConfig): TempSlot {
  if (time < config.tempSlots.morningBefore) return 'morning';
  if (time > config.tempSlots.nightAfter) return 'night';
  return 'midday';
}
