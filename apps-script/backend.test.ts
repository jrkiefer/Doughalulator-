/**
 * Backend tests: both Code.gs files run in-process against the stubbed
 * SpreadsheetApp/LockService world from harness.ts.
 */
import { describe, expect, it } from 'vitest';
import { bibles } from '../src/core/testHelpers';
import { biblesToPayload } from '../src/services/mapping';
import { get, loadScript, post, type LoadedScript } from './harness';

const SECRET = 'TEST-SECRET';

function freshDough(): LoadedScript {
  const script = loadScript('dough', SECRET);
  script.fns.setup();
  return script;
}

function freshTemps(): LoadedScript {
  const script = loadScript('temps', SECRET);
  script.fns.setup();
  return script;
}

function dayPayload(date: string) {
  return {
    secret: SECRET,
    type: 'day',
    date,
    tabs: [
      { tab: 'Summary', row: { Date: date, 'Forecast Tonight $': 7200, 'Sales Left $': -300 } },
      { tab: 'Dough Count', row: { Date: date, 'Boli Trays': 2, 'Boli Singles': 1, 'Boli Have': 13 } },
    ],
  };
}

describe('dough script — lock (§7)', () => {
  it('acquires and releases the script lock around every post', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    expect(script.world.lock.acquired).toBe(1);
    expect(script.world.lock.released).toBe(1);
  });

  it('a busy lock answers retryable-shaped — the client treats it as network-class', () => {
    const script = freshDough();
    script.world.lock.busy = true;
    const answer = post(script, dayPayload('2026-08-01'));
    expect(answer).toMatchObject({ ok: false, retryable: true });
  });
});

describe('dough script — validation (§7)', () => {
  it('rejects a bad secret', () => {
    const script = freshDough();
    const answer = post(script, { ...dayPayload('2026-08-01'), secret: 'WRONG' });
    expect(answer).toMatchObject({ ok: false, error: 'bad secret' });
    expect(answer.retryable).toBeUndefined();
  });

  it('rejects a missing or mangled date', () => {
    const script = freshDough();
    expect(post(script, dayPayload('not-a-date')).ok).toBe(false);
    expect(String(post(script, dayPayload('')).error)).toContain('invalid date');
  });

  it('rejects an empty save (nothing beyond the date)', () => {
    const script = freshDough();
    const answer = post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [{ tab: 'Summary', row: { Date: '2026-08-01' } }],
    });
    expect(String(answer.error)).toContain('empty save');
  });

  it('rejects nonsensical negatives but allows sales-left and Left/EON Check negatives', () => {
    const script = freshDough();
    const bad = post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [{ tab: 'Dough Count', row: { Date: '2026-08-01', 'Boli Trays': -2 } }],
    });
    expect(String(bad.error)).toContain('negative value');

    const fine = post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [
        { tab: 'Summary', row: { Date: '2026-08-01', 'Sales Left $': -300 } },
        { tab: 'Left', row: { Date: '2026-08-01', Small: -9, Shortages: 'Small -9' } },
        { tab: 'EON Check', row: { Date: '2026-08-01', Boli: -9, 'Trays Short': 'Boli 2' } },
      ],
    });
    expect(fine.ok).toBe(true);
  });
});

describe('dough script — merge-upsert + tolerant dates (§7)', () => {
  it('upserts by date: a second save updates the same row, never a duplicate', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [{ tab: 'Summary', row: { Date: '2026-08-01', 'Forecast Tonight $': 8000 } }],
    });
    const summary = script.world.ss.getSheetByName('Summary')!;
    expect(summary.getLastRow()).toBe(2); // header + one data row
    expect(summary.getCell(2, 3)).toBe(8000); // updated in place
    expect(summary.getCell(2, 5)).toBe(-300); // merge kept the untouched column
  });

  it('matches hand-typed sheet dates in common formats (M/D/YY)', () => {
    const script = freshDough();
    const summary = script.world.ss.getSheetByName('Summary')!;
    summary.setCell(2, 1, '8/1/26'); // someone hand-typed the date
    post(script, dayPayload('2026-08-01'));
    expect(summary.getLastRow()).toBe(2); // merged into the hand-typed row
  });

  it('normalizeDate handles ISO, M/D/YYYY, and 2-digit years', () => {
    const script = freshDough();
    const norm = script.fns.normalizeDate as (v: unknown) => string;
    expect(norm('2026-08-01')).toBe('2026-08-01');
    expect(norm('8/1/2026')).toBe('2026-08-01');
    expect(norm('8/1/26')).toBe('2026-08-01');
    expect(norm('Aug 1')).toBe('');
  });

  it('blank payload cells clear their sheet cells (blank ≠ zero end to end)', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [{ tab: 'Summary', row: { Date: '2026-08-01', 'Forecast Tonight $': '', 'Sales Left $': -300 } }],
    });
    const summary = script.world.ss.getSheetByName('Summary')!;
    expect(summary.getCell(2, 3)).toBe('');
  });
});

describe('dough script — headers and rename integrity (§0)', () => {
  it('setup writes Boli headers everywhere and the old misspelling never survives', () => {
    const script = freshDough();
    const doughCount = script.world.ss.getSheetByName('Dough Count')!;
    const headers = doughCount.headerRow(14);
    expect(headers).toContain('Boli Trays');
    expect(headers).toContain('Boli Have');
    const eonCheck = script.world.ss.getSheetByName('EON Check')!.headerRow(7);
    expect(eonCheck).toEqual(['Date', 'Indi', 'Small', 'Large', 'Sic', 'Boli', 'Trays Short']);
    for (const sheet of script.world.ss.sheets.values()) {
      for (const value of sheet.grid.values()) {
        expect(String(value)).not.toMatch(new RegExp('b' + 'oil', 'i'));
      }
    }
  });

  it('setup no longer creates the retired snapshot tab', () => {
    const script = freshDough();
    expect(script.world.ss.getSheetByName('Actual Use')).toBeNull();
  });
});

describe('dough script — Dough Use formulas (§8)', () => {
  it('installs the date spine and one live formula per usage column', () => {
    const script = freshDough();
    const use = script.world.ss.getSheetByName('Dough Use')!;
    expect(use.headerRow(13)).toEqual([
      'Date', 'AM Sales $', 'AM Indi', 'AM Small', 'AM Large', 'AM Sic', 'AM Boli',
      'PM Sales $', 'PM Indi', 'PM Small', 'PM Large', 'PM Sic', 'PM Boli',
    ]);
    expect(use.formulas.get('2:1')).toContain('SORT(UNIQUE');
    // AM Indi: yesterday's EON have − today's 2 PM have.
    expect(use.formulas.get('2:3')).toContain("VLOOKUP($A2:$A-1,'EON Count'");
    expect(use.formulas.get('2:3')).toContain("'Dough Count'");
    // PM Boli: final dough − EON have, gated by IFERROR on missing finals.
    const pmBoli = use.formulas.get('2:13')!;
    expect(pmBoli).toContain("'Final Dough'");
    expect(pmBoli).toContain("'EON Count'");
    expect(pmBoli).toContain('IFERROR');
  });
});

describe('dough script — fitted bibles (§8)', () => {
  it('Theil–Sen resists an outlier night', () => {
    const script = freshDough();
    const theilSen = script.fns.theilSen as (
      pts: [number, number][],
    ) => { slope: number; intercept: number };
    // Perfect line y = 0.01x, plus one wild outlier.
    const fit = theilSen([
      [4000, 40], [6000, 60], [8000, 80], [10000, 100], [7000, 500],
    ]);
    expect(fit.slope).toBeCloseTo(0.01, 3);
    expect(Math.abs(fit.intercept)).toBeLessThan(5);
  });

  it('emits a suggested table at the current thresholds beside current values', () => {
    const script = freshDough();
    // Mirror the real bibles first (thresholds + current values come from here).
    post(script, { secret: SECRET, ...biblesToPayload(bibles) });

    // Synthetic winter history in Dough Use + EON sales: use ≈ 1% of sales for
    // every size (AM half + PM half), across four nights.
    const use = script.world.ss.getSheetByName('Dough Use')!;
    const eon = script.world.ss.getSheetByName('EON Count')!;
    const nights: [string, number][] = [
      ['2026-01-05', 4000], ['2026-01-06', 8000], ['2026-01-07', 12000], ['2026-01-08', 16000],
    ];
    nights.forEach(([date, sales], i) => {
      const half = sales * 0.005;
      use.setCell(i + 2, 1, date);
      [3, 4, 5, 6].forEach((col) => use.setCell(i + 2, col, half)); // AM per size
      [10, 11, 12, 13].forEach((col) => use.setCell(i + 2, col, half)); // PM per size
      eon.setCell(i + 2, 1, date);
      eon.setCell(i + 2, 16, sales);
    });

    script.fns.generateFittedBibles();
    const fitted = script.world.ss.getSheetByName('New Dough Bible')!;
    expect(fitted.getCell(1, 1)).toContain('SUGGESTED');
    expect(fitted.rowByIndex(3, 9)).toEqual([
      'Sales', 'Indi (new)', 'Indi (now)', 'Small (new)', 'Small (now)',
      'Large (new)', 'Large (now)', 'Sic (new)', 'Sic (now)',
    ]);
    // First threshold is 3,750: fit says 1% of sales ≈ 38 balls; current Indi is 11.
    expect(fitted.getCell(4, 1)).toBe(3750);
    expect(fitted.getCell(4, 2)).toBe(38);
    expect(fitted.getCell(4, 3)).toBe(11);
    // Peach tab has no peach-season nights → says so instead of inventing numbers.
    const peachFitted = script.world.ss.getSheetByName('New Peach Bible')!;
    expect(String(peachFitted.getCell(3, 1))).toContain('Not enough history');
  });
});

describe('bible tripwire — app JSON vs the mirror the script writes', () => {
  it('the mirror tabs hold exactly the numbers in src/data', () => {
    const script = freshDough();
    const answer = post(script, { secret: SECRET, ...biblesToPayload(bibles) });
    expect(answer).toMatchObject({ ok: true, bibles: 'updated' });

    const mirror = script.world.ss.getSheetByName('Dough Bible')!;
    bibles.regular.rows.forEach((row, i) => {
      expect(mirror.rowByIndex(6 + i, 5)).toEqual(
        [row.sales, row.indi, row.small, row.large, row.sic].map(String),
      );
    });
    const peachMirror = script.world.ss.getSheetByName('Peach Bible')!;
    bibles.peach.rows.forEach((row, i) => {
      expect(peachMirror.rowByIndex(6 + i, 5)).toEqual(
        [row.sales, row.indi, row.small, row.large, row.sic].map(String),
      );
    });
    // And the hash gate: an identical resend is a no-op.
    expect(post(script, { secret: SECRET, ...biblesToPayload(bibles) })).toMatchObject({
      bibles: 'unchanged',
    });
  });
});

describe('temps script (§7)', () => {
  function tempsPayload(date = '2026-08-01') {
    return {
      secret: SECRET,
      type: 'temps',
      date,
      items: [
        {
          time: '07:02',
          slot: 'Morning',
          readings: [
            { station: 'Pizza 1', temp: 38.5 },
            { station: 'Freezer', temp: -4 },
          ],
        },
      ],
    };
  }

  it('locks around writes and answers retryable when busy', () => {
    const script = freshTemps();
    script.world.lock.busy = true;
    expect(post(script, tempsPayload())).toMatchObject({ ok: false, retryable: true });
    script.world.lock.busy = false;
    expect(post(script, tempsPayload()).ok).toBe(true);
    expect(script.world.lock.released).toBe(1);
  });

  it('validates: unknown slot, empty readings, non-number temps; negatives are FINE', () => {
    const script = freshTemps();
    expect(String(post(script, {
      ...tempsPayload(), items: [{ time: '07:02', slot: 'Brunch', readings: [{ station: 'Pizza 1', temp: 38 }] }],
    }).error)).toContain('unknown slot');
    expect(String(post(script, { ...tempsPayload(), items: [] }).error)).toContain('empty save');
    expect(String(post(script, {
      ...tempsPayload(), items: [{ time: '07:02', slot: 'Morning', readings: [{ station: 'Pizza 1', temp: 'warm' }] }],
    }).error)).toContain('not a number');
    expect(post(script, tempsPayload()).ok).toBe(true); // freezer at −4 accepted
  });

  it('appends the audit Log, merges station tabs by date+slot, refreshes Overview', () => {
    const script = freshTemps();
    post(script, tempsPayload());
    // Correction: same date + slot, new freezer value.
    post(script, {
      ...tempsPayload(),
      items: [{ time: '07:30', slot: 'Morning', readings: [{ station: 'Freezer', temp: -2 }] }],
    });

    const log = script.world.ss.getSheetByName('Log')!;
    expect(log.getLastRow()).toBe(4); // header + 3 audit lines (2 + the correction)
    expect(log.rowByIndex(4, 5)).toEqual(['2026-08-01', '07:30', 'Morning', 'Freezer', '-2']);

    const freezer = script.world.ss.getSheetByName('Freezer')!;
    expect(freezer.getLastRow()).toBe(2); // one row for the date…
    expect(freezer.getCell(2, 2)).toBe(-2); // …with the corrected Morning cell

    const overview = script.world.ss.getSheetByName('Overview')!;
    const freezerRow = overview.rowByIndex(9, 4); // Freezer is station 8
    expect(freezerRow).toEqual(['Freezer', '-2', 'Morning', '2026-08-01 07:30']);

    const day = get(script, { secret: SECRET, action: 'day', date: '8/1/26' });
    expect((day.stations as Record<string, unknown>)['Freezer']).toEqual({
      Morning: '-2', '2 PM': '', Night: '',
    });
  });
});

describe('wipe — deliberate clean slate (secret + confirm phrase)', () => {
  it('dough: erases every data row, keeps headers and bible mirrors, drops fitted tabs', () => {
    const script = freshDough();
    post(script, { secret: SECRET, ...biblesToPayload(bibles) });
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-02'));
    script.fns.generateFittedBibles();
    expect(script.world.ss.getSheetByName('New Dough Bible')).not.toBeNull();

    // Without the confirm phrase nothing happens.
    const refused = post(script, { secret: SECRET, type: 'wipe' });
    expect(refused.ok).toBe(false);
    expect(script.world.ss.getSheetByName('Summary')!.getLastRow()).toBe(3);

    const answer = post(script, { secret: SECRET, type: 'wipe', confirm: 'WIPE ALL DATA' });
    expect(answer).toMatchObject({ ok: true });
    expect(script.world.ss.getSheetByName('Summary')!.getLastRow()).toBe(1); // header only
    expect(script.world.ss.getSheetByName('Dough Count')!.getLastRow()).toBe(1);
    expect(script.world.ss.getSheetByName('Summary')!.headerRow(3)).toEqual([
      'Date', 'Bible Used', 'Forecast Tonight $',
    ]);
    // The real-data bible mirror survives; the test-derived suggestions do not.
    expect(script.world.ss.getSheetByName('Dough Bible')!.getLastRow()).toBeGreaterThan(5);
    expect(script.world.ss.getSheetByName('New Dough Bible')).toBeNull();
    // Life goes on: the next save starts cleanly at row 2.
    post(script, dayPayload('2026-08-03'));
    expect(script.world.ss.getSheetByName('Summary')!.getLastRow()).toBe(2);
  });

  it('temps: clears Log, station tabs, and Overview readings but keeps station names', () => {
    const script = freshTemps();
    post(script, {
      secret: SECRET,
      type: 'temps',
      date: '2026-08-01',
      items: [
        {
          time: '07:02',
          slot: 'Morning',
          readings: [
            { station: 'Pizza 1', temp: 38.5 },
            { station: 'Freezer', temp: -4 },
          ],
        },
      ],
    });
    expect(script.world.ss.getSheetByName('Log')!.getLastRow()).toBe(3);

    const answer = post(script, { secret: SECRET, type: 'wipe', confirm: 'WIPE ALL DATA' });
    expect(answer).toMatchObject({ ok: true });
    expect(script.world.ss.getSheetByName('Log')!.getLastRow()).toBe(1);
    expect(script.world.ss.getSheetByName('Pizza 1')!.getLastRow()).toBe(1);
    const overview = script.world.ss.getSheetByName('Overview')!;
    expect(overview.rowByIndex(2, 4)).toEqual(['Pizza 1', '', '', '']);
    expect(overview.rowByIndex(9, 4)).toEqual(['Freezer', '', '', '']);
  });
});

describe('dough script — batched reads (one pass per tab, any number of dates)', () => {
  it('date / recent / range agree on content, and absent tabs stay null', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-02'));
    post(script, {
      secret: SECRET,
      type: 'eon',
      date: '2026-08-02',
      tabs: [{ tab: 'EON Count', row: { Date: '2026-08-02', 'Final Sales $': 9100 } }],
    });

    const one = get(script, { secret: SECRET, action: 'date', date: '2026-08-01' });
    const tabs = one.tabs as Record<string, Record<string, string> | null>;
    expect(one.ok).toBe(true);
    expect(tabs['Summary']!['Forecast Tonight $']).toBe('7200');
    expect(tabs['Summary']!.Date).toBe('2026-08-01');
    // A tab with no row for this date reads null, not an empty object.
    expect(tabs['EON Count']).toBeNull();

    // recent returns the same rows, newest dates last, one entry per date.
    const recent = get(script, { secret: SECRET, action: 'recent', n: '30' });
    const recentDates = recent.dates as Record<string, Record<string, Record<string, string> | null>>;
    expect(Object.keys(recentDates).sort()).toEqual(['2026-08-01', '2026-08-02']);
    expect(recentDates['2026-08-01']['Summary']).toEqual(tabs['Summary']);
    expect(recentDates['2026-08-02']['EON Count']!['Final Sales $']).toBe('9100');

    // range narrows by date without changing row content.
    const range = get(script, { secret: SECRET, action: 'range', from: '2026-08-02', to: '2026-08-31' });
    const rangeDates = range.dates as Record<string, unknown>;
    expect(Object.keys(rangeDates)).toEqual(['2026-08-02']);

    // n caps the list to the most recent dates.
    const justOne = get(script, { secret: SECRET, action: 'recent', n: '1' });
    expect(Object.keys(justOne.dates as object)).toEqual(['2026-08-02']);
  });

  it('a duplicate hand-typed date row resolves to the first one, as a top-down scan would', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    const summary = script.world.ss.getSheetByName('Summary')!;
    // Someone hand-adds a second row for the same date, in another format.
    summary.setCell(3, 1, '8/1/26');
    summary.setCell(3, 3, 9999);

    const answer = get(script, { secret: SECRET, action: 'date', date: '2026-08-01' });
    const tabs = answer.tabs as Record<string, Record<string, string> | null>;
    expect(tabs['Summary']!['Forecast Tonight $']).toBe('7200'); // the first row wins
    // …and a save still merges into that same first row rather than the duplicate.
    post(script, {
      secret: SECRET,
      type: 'day',
      date: '8/1/26',
      tabs: [{ tab: 'Summary', row: { Date: '8/1/26', 'Forecast Tonight $': 8100 } }],
    });
    expect(summary.getCell(2, 3)).toBe(8100);
    expect(summary.getCell(3, 3)).toBe(9999); // duplicate untouched
  });

  it('reads work on an empty log and on a date nobody saved', () => {
    const script = freshDough();
    expect(get(script, { secret: SECRET, action: 'recent', n: '30' }).dates).toEqual({});
    const answer = get(script, { secret: SECRET, action: 'date', date: '2026-08-01' });
    const tabs = answer.tabs as Record<string, unknown>;
    expect(answer.ok).toBe(true);
    expect(Object.values(tabs).every((t) => t === null)).toBe(true);
  });
});

describe('writing past the sheet ceiling (a fresh Google sheet stops at 1000 rows)', () => {
  it('dough: a save that lands past the last row grows the sheet instead of throwing', () => {
    const script = freshDough();
    const summary = script.world.ss.getSheetByName('Summary')!;
    // Pretend the log already fills the sheet to its ceiling.
    summary.setCell(summary.getMaxRows(), 1, '2026-01-01');
    expect(summary.getLastRow()).toBe(1000);

    const answer = post(script, dayPayload('2026-08-01'));
    expect(answer.ok).toBe(true); // a throw here would park the record as "rejected"
    expect(summary.getMaxRows()).toBeGreaterThan(1000);
    expect(summary.getCell(1001, 3)).toBe(7200);
  });

  it('temps: the append-only Log grows past the ceiling rather than refusing saves', () => {
    const script = freshTemps();
    const log = script.world.ss.getSheetByName('Log')!;
    log.setCell(log.getMaxRows(), 1, '2026-01-01');

    const answer = post(script, {
      secret: SECRET,
      type: 'temps',
      date: '2026-08-01',
      items: [{ time: '07:02', slot: 'Morning', readings: [{ station: 'Pizza 1', temp: 38 }] }],
    });
    expect(answer).toMatchObject({ ok: true, saved: 1 });
    expect(log.getMaxRows()).toBeGreaterThan(1000);
    expect(log.rowByIndex(1001, 5)).toEqual(['2026-08-01', '07:02', 'Morning', 'Pizza 1', '38']);
  });
});

describe('a wipe erases data without stripping the sheet formatting', () => {
  it('keeps the header row, the row count, and the red-warning rules setup() installed', () => {
    const script = freshDough();
    const left = script.world.ss.getSheetByName('Left')!;
    const rulesBefore = left.getConditionalFormatRules().length;
    const maxRowsBefore = left.getMaxRows();
    post(script, {
      secret: SECRET,
      type: 'day',
      date: '2026-08-01',
      tabs: [{ tab: 'Left', row: { Date: '2026-08-01', Small: -9, Shortages: 'Small -9' } }],
    });
    expect(left.getLastRow()).toBe(2);

    expect(post(script, { secret: SECRET, type: 'wipe', confirm: 'WIPE ALL DATA' }).ok).toBe(true);
    expect(left.getLastRow()).toBe(1); // data gone
    expect(left.headerRow(6)[0]).toBe('Date'); // header intact
    // Deleting rows would have shrunk both of these, silently killing the red
    // highlight the owner relies on to spot a miscount.
    expect(left.getConditionalFormatRules().length).toBe(rulesBefore);
    expect(left.getMaxRows()).toBe(maxRowsBefore);
  });
});
