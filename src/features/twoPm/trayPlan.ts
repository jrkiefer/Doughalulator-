/**
 * The night's trays, in three parts — the one place either 2 PM card reads
 * them from.
 *
 * The two cards used to work this out separately, and drifted: the Day's Work
 * pills showed the trays AFTER the batch rounding while the By Size table
 * showed the plain bible plan, so a night that rounded up read "LG 16" on one
 * card and "LG 15" on the next with nothing in between to explain it. Both
 * numbers were right; only the story was missing. Now both cards read this,
 * and the By Size table draws all three parts.
 *
 * Pure — a record in, three numbers per size out. No React, no I/O.
 */
import type { BatchOption, DoughDayRecord, Maybe, SizeKey } from '../../core/types';

export interface TrayLine {
  /** Trays the bible asked for, before the batch rounding moved anything. */
  plan: Maybe;
  /**
   * Trays the rounding added (+) or trimmed (−). 0 when nothing moved — only
   * Small and Large ever absorb a batch adjustment.
   */
  round: number;
  /** What actually gets made: the plan with the rounding applied. */
  final: Maybe;
}

const SIZES: SizeKey[] = ['indi', 'small', 'large', 'sic', 'boli'];

/** The batch option in force: the tapped pill, or the one the remainder rule settled on. */
function chosenOption(record: DoughDayRecord): BatchOption | null {
  if (record.chosenBatchOption === null) return null;
  return record.chosenBatchOption === 'down' ? record.batchDown : record.batchUp;
}

/**
 * Plan, rounding and final trays for all five sizes.
 *
 * Two rules earn their keep here:
 *
 * 1. `round` is measured as FINAL − PLAN, never taken from the option's
 *    requested delta. `buildBatchOption` floors Small and Large at zero trays,
 *    so a deep round-down can move less than it asked to — reporting the
 *    request would promise a trim that never happened.
 * 2. A size nobody counted stays null on both ends with a 0 round. Blank is
 *    never a zero here, exactly as everywhere else in the app.
 */
export function trayPlan(record: DoughDayRecord): Record<SizeKey, TrayLine> {
  const chosen = chosenOption(record);
  const lines = {} as Record<SizeKey, TrayLine>;

  for (const size of SIZES) {
    // Boli is a top-up rather than a bible size, so its plan lives on its own
    // field; the other four come off the bible's tray plan.
    const plan: Maybe = size === 'boli' ? record.boliTrays : record.trays[size];
    // With no direction in force there is nothing to make yet, so the plan IS
    // the final answer — the same fallback the Day's Work pills have always used.
    const final: Maybe = chosen ? chosen.finalTraysToMake[size] : plan;
    lines[size] = {
      plan,
      round: plan === null || final === null ? 0 : final - plan,
      final,
    };
  }
  return lines;
}
