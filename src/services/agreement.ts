/**
 * Do the sheet and the app agree?
 *
 * The sheet now owns the arithmetic: the app writes the counts, formulas do
 * the rest. That is only trustworthy if the two independently land on the
 * same numbers — so the app fetches what the sheet computed for a date and
 * compares it, line by line, against what its own engine computed from the
 * same counts.
 *
 * Pure: rows in, verdict out. A line where either side has nothing to say is
 * skipped rather than counted as a disagreement, so a half-entered night
 * reads "nothing to check yet" instead of crying wolf.
 */
import type { DoughDayRecord, Maybe } from '../core/types';

type SheetRow = Record<string, string | number>;
export type SheetTabs = Record<string, SheetRow | null>;

export interface CheckLine {
  label: string;
  app: number;
  sheet: number;
  agrees: boolean;
}

export interface Agreement {
  state: 'agree' | 'differ' | 'unchecked';
  checked: number;
  lines: CheckLine[];
  /** Only the lines that disagree — what the owner actually needs to see. */
  problems: CheckLine[];
}

/** A sheet cell as a number, or null when blank or a note like "check count?". */
function num(row: SheetRow | null | undefined, key: string): Maybe {
  if (!row) return null;
  const raw = row[key];
  if (raw === undefined || raw === null) return null;
  const s = String(raw).trim();
  if (s === '') return null;
  const n = Number(s.replace(/[$,]/g, ''));
  return Number.isFinite(n) ? n : null;
}

const MAKE_TAB = 'Calculation Step Dough Make (estimate)';
const PM_TAB = 'Calculation Step Look up Dough Use for PM';
const TOM_TAB = 'Calculation Step Look up Dough Use for Tomorrow';
const FINAL_TAB = 'Final Make Amount';

const SIZES = [
  { key: 'indi', label: 'Indi' },
  { key: 'small', label: 'Small' },
  { key: 'large', label: 'Large' },
  { key: 'sic', label: 'Sic' },
] as const;

/**
 * Compare one date. `record` is the app's own calculation from the counts on
 * screen; `tabs` is what the sheet answered for the same date.
 */
export function checkAgreement(record: DoughDayRecord, tabs: SheetTabs | null): Agreement {
  const lines: CheckLine[] = [];
  const add = (label: string, app: Maybe, sheet: Maybe) => {
    // Nothing to compare unless BOTH sides produced a number.
    if (app === null || sheet === null) return;
    lines.push({ label, app, sheet, agrees: app === sheet });
  };

  if (tabs) {
    const make = tabs[MAKE_TAB];
    const pm = tabs[PM_TAB];
    const tom = tabs[TOM_TAB];
    const final = tabs[FINAL_TAB];

    for (const { key, label } of SIZES) {
      add(`${label} used tonight`, record.use[key], num(pm, label));
      add(`${label} needed tomorrow`, record.need[key], num(tom, label));
    }

    add('Indi trays to make', record.trays.indi, num(make, 'Indi Trays'));
    add('Small trays to make', record.trays.small, num(make, 'Small Trays'));
    add('Large trays to make', record.trays.large, num(make, 'Large Trays'));
    add('Sic balls to make', record.sicBalls, num(make, 'Sic Balls'));
    add('Boli trays to make', record.boliTrays, num(make, 'Boli Trays'));
    add('Total trays', record.totalTrays, num(make, 'Trays Total'));

    // The batch-dependent lines only exist once the owner has tapped a choice.
    const chosen =
      record.chosenBatchOption === 'down'
        ? record.batchDown
        : record.chosenBatchOption === 'up'
          ? record.batchUp
          : null;
    if (chosen) {
      add('Batches', chosen.batches, num(make, 'Batches'));
      add('Indi trays after batching', chosen.finalTraysToMake.indi, num(final, 'Indi Trays'));
      add('Small trays after batching', chosen.finalTraysToMake.small, num(final, 'Small Trays'));
      add('Large trays after batching', chosen.finalTraysToMake.large, num(final, 'Large Trays'));
      add('Boli trays after batching', chosen.finalTraysToMake.boli, num(final, 'Boli Trays'));
    }
  }

  const problems = lines.filter((l) => !l.agrees);
  return {
    state: lines.length === 0 ? 'unchecked' : problems.length === 0 ? 'agree' : 'differ',
    checked: lines.length,
    lines,
    problems,
  };
}
