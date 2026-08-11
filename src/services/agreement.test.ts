import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { runDoughCalculation } from '../core';
import { bibles, counts } from '../core/testHelpers';
import { checkAgreement, type SheetTabs } from './agreement';

const MAKE = 'Calculation Step Dough Make (estimate)';
const PM = 'Calculation Step Look up Dough Use for PM';
const TOM = 'Calculation Step Look up Dough Use for Tomorrow';
const FINAL = 'Final Make Amount';

function record(rounding: 'down' | 'up' | null = 'up') {
  const base = runDoughCalculation(
    {
      date: '2026-01-15',
      counts: counts({
        indiSingles: 15, smallSingles: 43, largeSingles: 26, sicSingles: 1, boliSingles: 13,
      }),
      todayForecastRaw: 7200,
      currentSalesRaw: 4500,
      tomorrowForecastRaw: 9100,
    },
    bibles,
    defaultConfig,
  );
  return { ...base, chosenBatchOption: rounding };
}

/** A sheet that answered with exactly what the engine worked out. */
function matchingTabs(r: ReturnType<typeof record>): SheetTabs {
  const chosen = r.chosenBatchOption === 'down' ? r.batchDown! : r.batchUp!;
  return {
    [PM]: { Indi: r.use.indi!, Small: r.use.small!, Large: r.use.large!, Sic: r.use.sic! },
    [TOM]: { Indi: r.need.indi!, Small: r.need.small!, Large: r.need.large!, Sic: r.need.sic! },
    [MAKE]: {
      'Indi Trays': r.trays.indi!,
      'Small Trays': r.trays.small!,
      'Large Trays': r.trays.large!,
      'Sic Balls': r.sicBalls!,
      'Boli Trays': r.boliTrays!,
      'Trays Total': r.totalTrays!,
      Batches: chosen.batches,
    },
    [FINAL]: {
      'Indi Trays': chosen.finalTraysToMake.indi!,
      'Small Trays': chosen.finalTraysToMake.small!,
      'Large Trays': chosen.finalTraysToMake.large!,
      'Boli Trays': chosen.finalTraysToMake.boli!,
    },
  };
}

describe('app vs sheet agreement', () => {
  it('every number matching reads as agreement, and says how many it checked', () => {
    const r = record();
    const verdict = checkAgreement(r, matchingTabs(r));
    expect(verdict.state).toBe('agree');
    expect(verdict.problems).toEqual([]);
    // Both bible lookups, the per-size make, the totals and the batch lines.
    expect(verdict.checked).toBeGreaterThan(15);
  });

  it('one wrong cell is named with both numbers, and nothing else is flagged', () => {
    const r = record();
    const tabs = matchingTabs(r);
    tabs[MAKE]!['Small Trays'] = Number(tabs[MAKE]!['Small Trays']) + 1;
    const verdict = checkAgreement(r, tabs);
    expect(verdict.state).toBe('differ');
    expect(verdict.problems).toHaveLength(1);
    expect(verdict.problems[0]).toMatchObject({
      label: 'Small trays to make',
      app: r.trays.small,
      sheet: r.trays.small! + 1,
    });
  });

  it('a sheet cell the formulas left blank is skipped, not called a disagreement', () => {
    const r = record();
    const tabs = matchingTabs(r);
    tabs[MAKE]!['Small Trays'] = '';
    tabs[PM]!.Indi = '';
    expect(checkAgreement(r, tabs).state).toBe('agree');
  });

  it('a note like "check count?" counts as no number rather than as zero', () => {
    const r = record();
    const tabs = matchingTabs(r);
    tabs[MAKE]!['Boli Trays'] = 'check count?';
    expect(checkAgreement(r, tabs).state).toBe('agree');
  });

  it('no sheet answer at all reads as unchecked, never as agreement', () => {
    const verdict = checkAgreement(record(), null);
    expect(verdict.state).toBe('unchecked');
    expect(verdict.checked).toBe(0);
  });

  it('the batch-dependent lines only get checked once a choice is tapped', () => {
    const r = record(null);
    const tabs = matchingTabs(record('up')); // the sheet has numbers…
    const verdict = checkAgreement(r, tabs); // …but the app has no choice yet
    expect(verdict.state).toBe('agree');
    expect(verdict.lines.some((l) => l.label === 'Batches')).toBe(false);
    expect(verdict.lines.some((l) => l.label === 'Indi used tonight')).toBe(true);
  });

  it('a sheet cell formatted as text or currency still compares as a number', () => {
    const r = record();
    const tabs = matchingTabs(r);
    tabs[MAKE]!['Trays Total'] = `${r.totalTrays!}`;
    tabs[PM]!.Small = `$${r.use.small!}`;
    expect(checkAgreement(r, tabs).state).toBe('agree');
  });
});
