/**
 * Backend tests: both Code.gs files run in-process against the stubbed
 * SpreadsheetApp/LockService world from harness.ts.
 */
import { describe, expect, it } from 'vitest';
import { bibles } from '../../src/core/testHelpers';
import { biblesToPayload } from '../../src/services/mapping';
import { get, loadScript, post, type LoadedScript } from './harness';


function freshDough(): LoadedScript {
  const script = loadScript('dough');
  script.fns.setup();
  return script;
}

function freshTemps(): LoadedScript {
  const script = loadScript('temps');
  script.fns.setup();
  return script;
}

function dayPayload(date: string) {
  return {
    type: 'day',
    date,
    tabs: [
      {
        tab: '2PM Dough Count',
        row: {
          Date: date,
          "Today's Forecast": 7200,
          'Current Sales': 4500,
          'Sales Left': 2700,
          "Tomorrow's Forecast": 9100,
          'Indi Count': 34,
          'Small Count': 156,
          'Large Count': 154,
          'Sic Count': 2,
          'Boli Count': 36,
          Bible: 'regular',
          'Batch Rounding': 'up',
        },
      },
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
    expect(post(script, dayPayload('2026-08-01'))).toMatchObject({ ok: false, retryable: true });
  });
});

/** Every cell of every tab, straight from the fake grid. */
function allCells(script: LoadedScript): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const [name, sheet] of script.world.ss.sheets) {
    const cells: Record<string, string> = {};
    for (const [key, value] of sheet.grid) {
      cells[key] = value instanceof Date ? `D:${value.toISOString().slice(0, 10)}` : String(value);
    }
    out[name] = cells;
  }
  return out;
}

describe('setup() on a notebook that already holds real records', () => {
  // The owner clicks Dough Tools -> Re-run setup after pasting a new version of
  // this script, on a log holding months of real nights. Nothing it does may
  // touch a single recorded cell.
  it('re-running it changes nothing at all', () => {
    const script = freshDough();
    for (const date of ['2026-05-13', '2026-06-11', '2026-07-10']) {
      expect(post(script, dayPayload(date)).ok).toBe(true);
      expect(post(script, {
        type: 'eon', date,
        tabs: [{ tab: 'EON Dough Count', row: { Date: date, 'EON Sales': 11622, 'EON Indi Count': 63 } }],
      }).ok).toBe(true);
    }

    const before = allCells(script);
    script.fns.setup();
    expect(allCells(script)).toEqual(before);
  });
});

describe('dough script — validation', () => {
  it('erasing is NOT reachable over the web — with no key it would be a public delete button', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    ['wipe', 'retire'].forEach((type) => {
      const answer = post(script, { type, confirm: 'WIPE ALL DATA' });
      expect(answer.ok).toBe(false);
      expect(String(answer.error)).toContain('unknown type');
    });
    // …and the day survived the attempts.
    expect(script.world.ss.getSheetByName('2PM Dough Count')!.getLastRow()).toBe(2);
  });

  it('a save needs no password at all', () => {
    const script = freshDough();
    expect(post(script, dayPayload('2026-08-01'))).toMatchObject({ ok: true, saved: 'day' });
    expect(get(script, { action: 'ping' })).toMatchObject({ ok: true, sheet: 'dough' });
  });

  it('rejects a missing or mangled date', () => {
    const script = freshDough();
    expect(post(script, dayPayload('not-a-date')).ok).toBe(false);
    expect(String(post(script, dayPayload('')).error)).toContain('invalid date');
  });

  it('accepts every tab the app fills, and refuses one it does not know', () => {
    const script = freshDough();
    expect(post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: 'Final Make Amount', row: { Date: '2026-08-01', 'Indi Trays': 3 } }],
    }).ok).toBe(true);
    expect(String(post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: 'Made Up Tab', row: { Date: '2026-08-01', Whatever: 3 } }],
    }).error)).toContain('unknown tab');
  });

  it('refuses a column the tab does not have, instead of dropping it in silence', () => {
    // upsertRow looks a column up by heading and skips what it cannot find. A
    // heading renamed on one side only would otherwise just stop recording,
    // with no error anywhere — the same quiet failure mode as a tab-name clash.
    const script = freshDough();
    const answer = post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: 'Final Make Amount', row: { Date: '2026-08-01', 'Indi Trayz': 3 } }],
    });
    expect(answer.ok).toBe(false);
    expect(String(answer.error)).toContain('unknown column');
    // and nothing was written on the way to finding out
    expect(script.world.ss.getSheetByName('Final Make Amount')!.getLastRow()).toBe(1);
  });

  it('rejects an empty save and nonsensical negatives, but allows a negative sales-left', () => {
    const script = freshDough();
    expect(String(post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01' } }],
    }).error)).toContain('empty save');

    expect(String(post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01', 'Indi Count': -2 } }],
    }).error)).toContain('negative value');

    expect(post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01', 'Sales Left': -300 } }],
    }).ok).toBe(true);
  });
});

describe('dough script — merge-upsert + tolerant dates (§7)', () => {
  it('upserts by date: a second save updates the same row, never a duplicate', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01', "Today's Forecast": 8000 } }],
    });
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    expect(sheet.getLastRow()).toBe(2); // header + one data row
    expect(sheet.getCell(2, 2)).toBe(8000); // updated in place
    expect(sheet.getCell(2, 6)).toBe(34); // merge kept the untouched column
  });

  it('matches hand-typed sheet dates in common formats (M/D/YY)', () => {
    const script = freshDough();
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    sheet.setCell(2, 1, '8/1/26');
    post(script, dayPayload('2026-08-01'));
    expect(sheet.getLastRow()).toBe(2); // merged into the hand-typed row
  });

  it('normalizeDate handles ISO, M/D/YYYY, 2-digit years, and real date cells', () => {
    const script = freshDough();
    const norm = script.fns.normalizeDate as (v: unknown) => string;
    expect(norm('2026-08-01')).toBe('2026-08-01');
    expect(norm('8/1/2026')).toBe('2026-08-01');
    expect(norm('8/1/26')).toBe('2026-08-01');
    expect(norm(new Date(2026, 7, 1))).toBe('2026-08-01');
    expect(norm('Aug 1')).toBe('');
  });

  it('blank payload cells clear their sheet cells (blank ≠ zero end to end)', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      type: 'day', date: '2026-08-01',
      // A save always carries the whole row, so a cleared field travels
      // alongside the fields that still have numbers.
      tabs: [{
        tab: '2PM Dough Count',
        row: { Date: '2026-08-01', "Today's Forecast": '', 'Current Sales': 4500 },
      }],
    });
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    expect(sheet.getCell(2, 2)).toBe('');
    expect(sheet.getCell(2, 3)).toBe(4500);
  });

  it('an EON save lands in its own tab, untouched by the 2 PM save', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      type: 'eon', date: '2026-08-01',
      tabs: [{ tab: 'EON Dough Count', row: { Date: '2026-08-01', 'EON Sales': 9100, 'EON Indi Count': 20 } }],
    });
    expect(script.world.ss.getSheetByName('EON Dough Count')!.rowByIndex(2, 3))
      .toEqual(['2026-08-01', '9100', '20']);
    expect(script.world.ss.getSheetByName('2PM Dough Count')!.getCell(2, 6)).toBe(34);
  });
});

describe('dough script — a plain record, no formulas to break', () => {
  it('setup builds every tab of the layout with headers only', () => {
    const script = freshDough();
    const ss = script.world.ss;

    expect(ss.getSheetByName('2PM Dough Count')!.headerRow(13)).toEqual([
      'Date', "Today's Forecast", 'Current Sales', 'Sales Left', "Tomorrow's Forecast",
      'Indi Count', 'Small Count', 'Large Count', 'Sic Count', 'Boli Count',
      'Bible', 'Forecast Rounding', 'Batch Rounding',
    ]);
    expect(ss.getSheetByName('EON Dough Count')!.headerRow(6)).toEqual([
      'Date', 'EON Sales', 'EON Indi Count', 'EON Small Count', 'EON Large Count', 'EON Sic Count',
    ]);
    expect(ss.getSheetByName('Dough Make (estimate)')!.headerRow(9)).toEqual([
      'Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic (balls)', 'Boli Trays',
      'Batch Rounding', 'Trays Total', 'Batches',
    ]);
    expect(ss.getSheetByName('Estimated Dough After Gang')!.headerRow(6)[0]).toBe('Date');
    // Every tab name has to survive Google's 31-character cap.
    for (const name of ss.sheets.keys()) expect(name.length).toBeLessThanOrEqual(31);
    expect(ss.getSheetByName('AM Dough Use')!.headerRow(7)[2]).toBe('AM Indi Use');
    expect(ss.getSheetByName('PM Dough Use')!.headerRow(7)[2]).toBe('PM Indi Use');
    // The app is the only calculator: nothing in this sheet computes anything.
    for (const sheet of ss.sheets.values()) {
      expect(sheet.formulas.size).toBe(0);
    }
    expect(ss.getSheetByName('Bible Lookup (auto)')).toBeNull();
  });

  it('a save lands each number in its own tab, all in one post', () => {
    const script = freshDough();
    post(script, {
      type: 'day', date: '2026-08-01',
      tabs: [
        ...dayPayload('2026-08-01').tabs,
        { tab: 'Dough Make (estimate)',
          row: { Date: '2026-08-01', 'Indi Trays': 4, 'Trays Total': 78, Batches: 8 } },
        { tab: 'Estimated Dough After Gang',
          row: { Date: '2026-08-01', Indi: 64, Small: 378 } },
      ],
    });
    expect(script.world.ss.getSheetByName('Dough Make (estimate)')!
      .rowByIndex(2, 9)[8]).toBe('8');
    expect(script.world.ss.getSheetByName('Estimated Dough After Gang')!
      .getCell(2, 2)).toBe(64);
  });

  it('the retired layout can be cleared away from the menu', () => {
    const script = freshDough();
    script.world.ss.insertSheet('Summary');
    script.world.ss.insertSheet('Dough Use');
    expect(script.fns.removeRetiredTabs()).toBe(2);
    expect(script.world.ss.getSheetByName('Summary')).toBeNull();
  });
});

describe('dough script — fitted bibles (§8)', () => {
  it('Theil–Sen resists an outlier night', () => {
    const script = freshDough();
    const theilSen = script.fns.theilSen as (
      pts: [number, number][],
    ) => { slope: number; intercept: number };
    const fit = theilSen([[4000, 40], [6000, 60], [8000, 80], [10000, 100], [7000, 500]]);
    expect(fit.slope).toBeCloseTo(0.01, 3);
    expect(Math.abs(fit.intercept)).toBeLessThan(5);
  });
});

describe('bible tripwire — app JSON vs the mirror the script writes', () => {
  it('the mirror tabs hold exactly the numbers in src/data', () => {
    const script = freshDough();
    expect(post(script, { ...biblesToPayload(bibles) }))
      .toMatchObject({ ok: true, bibles: 'updated' });

    const mirror = script.world.ss.getSheetByName('Dough Bible')!;
    expect(mirror.headerRow(5)).toEqual(['Threshold', 'Indi', 'Small', 'Large', 'Sicilian']);
    bibles.regular.rows.forEach((row, i) => {
      expect(mirror.rowByIndex(2 + i, 5)).toEqual(
        [row.sales, row.indi, row.small, row.large, row.sic].map(String),
      );
    });

    expect(post(script, { ...biblesToPayload(bibles) }))
      .toMatchObject({ bibles: 'unchanged' });
  });
});

describe('temps script (§7)', () => {
  function tempsPayload(date = '2026-08-01') {
    return {
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

    const day = get(script, { action: 'day', date: '8/1/26' });
    expect((day.stations as Record<string, unknown>)['Freezer']).toEqual({
      Morning: '-2', '2 PM': '', Night: '',
    });
  });
});

describe('erasing from the menu, the only way left', () => {
  it('dough: clears every data row but keeps headings and the bible mirrors', () => {
    const script = freshDough();
    post(script, biblesToPayload(bibles));
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-02'));
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    expect(input.getLastRow()).toBe(3);

    expect(script.fns.wipeAllData()).toBe(2);
    expect(input.getLastRow()).toBe(1); // header only
    expect(input.headerRow(3)).toEqual(['Date', "Today's Forecast", 'Current Sales']);
    expect(script.world.ss.getSheetByName('Dough Bible')!.getLastRow()).toBeGreaterThan(1);

    // Life goes on: the next save starts cleanly at row 2.
    post(script, dayPayload('2026-08-03'));
    expect(input.getLastRow()).toBe(2);
  });

  it('temps: clears the Log and station tabs, keeping the station names', () => {
    const script = freshTemps();
    post(script, {
      type: 'temps', date: '2026-08-01',
      items: [{ time: '07:02', slot: 'Morning', readings: [
        { station: 'Pizza 1', temp: 38.5 }, { station: 'Freezer', temp: -4 }] }],
    });
    expect(script.world.ss.getSheetByName('Log')!.getLastRow()).toBe(3);

    script.fns.wipeAllData();
    expect(script.world.ss.getSheetByName('Log')!.getLastRow()).toBe(1);
    expect(script.world.ss.getSheetByName('Pizza 1')!.getLastRow()).toBe(1);
    const overview = script.world.ss.getSheetByName('Overview')!;
    expect(overview.rowByIndex(2, 4)).toEqual(['Pizza 1', '', '', '']);
  });

  it('temps: erasing is not reachable over the web either', () => {
    const script = freshTemps();
    const answer = post(script, { type: 'wipe', confirm: 'WIPE ALL DATA' });
    expect(answer.ok).toBe(false);
    expect(String(answer.error)).toContain('unknown type');
  });
});

describe('dough script — batched reads (one pass per tab, any number of dates)', () => {
  it('date / recent / range agree on content, and absent tabs stay null', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-02'));
    post(script, {
      type: 'eon',
      date: '2026-08-02',
      tabs: [{ tab: 'EON Dough Count', row: { Date: '2026-08-02', 'EON Sales': 9100 } }],
    });

    const one = get(script, { action: 'date', date: '2026-08-01' });
    const tabs = one.tabs as Record<string, Record<string, string> | null>;
    expect(one.ok).toBe(true);
    expect(tabs['2PM Dough Count']!["Today's Forecast"]).toBe('7200');
    expect(tabs['2PM Dough Count']!.Date).toBe('2026-08-01');
    // A tab with no row for this date reads null, not an empty object.
    expect(tabs['EON Dough Count']).toBeNull();

    // recent returns the same rows, newest dates last, one entry per date.
    const recent = get(script, { action: 'recent', n: '30' });
    const recentDates = recent.dates as Record<string, Record<string, Record<string, string> | null>>;
    expect(Object.keys(recentDates).sort()).toEqual(['2026-08-01', '2026-08-02']);
    expect(recentDates['2026-08-01']['2PM Dough Count']).toEqual(tabs['2PM Dough Count']);
    expect(recentDates['2026-08-02']['EON Dough Count']!['EON Sales']).toBe('9100');

    // range narrows by date without changing row content.
    const range = get(script, { action: 'range', from: '2026-08-02', to: '2026-08-31' });
    const rangeDates = range.dates as Record<string, unknown>;
    expect(Object.keys(rangeDates)).toEqual(['2026-08-02']);

    // n caps the list to the most recent dates.
    const justOne = get(script, { action: 'recent', n: '1' });
    expect(Object.keys(justOne.dates as object)).toEqual(['2026-08-02']);
  });

  it('a duplicate hand-typed date row resolves to the first one, as a top-down scan would', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    // Someone hand-adds a second row for the same date, in another format.
    input.setCell(3, 1, '8/1/26');
    input.setCell(3, 2, 9999);

    const answer = get(script, { action: 'date', date: '2026-08-01' });
    const tabs = answer.tabs as Record<string, Record<string, string> | null>;
    expect(tabs['2PM Dough Count']!["Today's Forecast"]).toBe('7200'); // the first row wins
    // …and a save still merges into that same first row rather than the duplicate.
    post(script, {
      type: 'day',
      date: '8/1/26',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '8/1/26', "Today's Forecast": 8100 } }],
    });
    expect(input.getCell(2, 2)).toBe(8100);
    expect(input.getCell(3, 2)).toBe(9999); // duplicate untouched
  });

  it('reads work on an empty log and on a date nobody saved', () => {
    const script = freshDough();
    expect(get(script, { action: 'recent', n: '30' }).dates).toEqual({});
    const answer = get(script, { action: 'date', date: '2026-08-01' });
    const tabs = answer.tabs as Record<string, unknown>;
    expect(answer.ok).toBe(true);
    expect(Object.values(tabs).every((t) => t === null)).toBe(true);
  });
});

describe('writing past the sheet ceiling (a fresh Google sheet stops at 1000 rows)', () => {
  it('dough: a save that lands past the last row grows the sheet instead of throwing', () => {
    const script = freshDough();
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    // Pretend the log already fills the sheet to its ceiling.
    input.setCell(input.getMaxRows(), 1, '2026-01-01');
    expect(input.getLastRow()).toBe(1000);

    const answer = post(script, dayPayload('2026-08-01'));
    expect(answer.ok).toBe(true); // a throw here would park the record as "rejected"
    expect(input.getMaxRows()).toBeGreaterThan(1000);
    expect(input.getCell(1001, 2)).toBe(7200);
  });

  it('temps: the append-only Log grows past the ceiling rather than refusing saves', () => {
    const script = freshTemps();
    const log = script.world.ss.getSheetByName('Log')!;
    log.setCell(log.getMaxRows(), 1, '2026-01-01');

    const answer = post(script, {
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
  it('keeps the header row and the sheet size a wipe should never shrink', () => {
    const script = freshDough();
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    const maxRowsBefore = input.getMaxRows();
    post(script, dayPayload('2026-08-01'));
    expect(input.getLastRow()).toBe(2);

    script.fns.wipeAllData();
    expect(input.getLastRow()).toBe(1); // data gone
    expect(input.headerRow(2)[0]).toBe('Date'); // header intact
    // Deleting rows would have shrunk the sheet and its formats along with it.
    expect(input.getMaxRows()).toBe(maxRowsBefore);
  });
});

/**
 * One fully recorded day, exactly as the notebook would hold it. Every count
 * sits at 100 balls, so the arithmetic is checkable at a glance:
 *   AM use = last EON (100) − 2 PM count (100 − am) = am
 *   PM use = after gang (100 + pm) − tonight's EON (100) = pm
 * and the day's whole use per size is exactly `use`. Tonight's closing 100
 * seeds tomorrow's morning, so consecutive days chain like real ones.
 */
function fullDay(script: LoadedScript, date: string, sales: number, use: number, bible?: string) {
  const am = Math.floor(use / 2);
  const pm = use - am;
  post(script, {
    type: 'day',
    date,
    tabs: [
      { tab: '2PM Dough Count',
        row: { Date: date, 'Indi Count': 100 - am, 'Small Count': 100 - am,
          'Large Count': 100 - am, 'Sic Count': 100 - am, ...(bible ? { Bible: bible } : {}) } },
      { tab: 'Estimated Dough After Gang',
        row: { Date: date, Indi: 100 + pm, Small: 100 + pm, Large: 100 + pm, Sic: 100 + pm } },
    ],
  });
  post(script, {
    type: 'eon',
    date,
    tabs: [
      { tab: 'EON Dough Count',
        row: { Date: date, 'EON Sales': sales, 'EON Indi Count': 100, 'EON Small Count': 100,
          'EON Large Count': 100, 'EON Sic Count': 100 } },
    ],
  });
}

/** A bare closing count with no takings: feeds the next morning, is no point itself. */
function seedEon(script: LoadedScript, date: string) {
  post(script, {
    type: 'eon',
    date,
    tabs: [
      { tab: 'EON Dough Count',
        row: { Date: date, 'EON Indi Count': 100, 'EON Small Count': 100,
          'EON Large Count': 100, 'EON Sic Count': 100 } },
    ],
  });
}

describe('the new bible builds itself as whole days accumulate', () => {
  it('derives each day as AM + PM from the recorded tabs, then fits', () => {
    const script = freshDough();
    post(script, { ...biblesToPayload(bibles) });
    const build = script.world.ss.getSheetByName('New Bieblerb')!;

    // Under three days a line is noise, so nothing is suggested yet.
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'regular');
    fullDay(script, '2026-09-03', 6000, 60, 'regular');
    expect(build.getCell(2, 10)).toBe(''); // New Indi still blank

    // A third day makes the trend real: use runs at 1% of sales.
    fullDay(script, '2026-09-04', 8000, 80, 'regular');
    // The history block holds the derived whole days, hand-checkable.
    expect(build.getCell(2, 2)).toBe(4000);
    expect(build.getCell(2, 3)).toBe(40); // 20 in the morning + 20 at night
    expect(build.getCell(2, 6)).toBe(40);
    expect(build.getCell(4, 2)).toBe(8000);
    expect(build.getCell(4, 5)).toBe(80);
    // And the suggestion columns fill beside the current bible.
    const first = bibles.regular.rows[0];
    expect(build.getCell(2, 8)).toBe(first.sales); // X Sales
    expect(build.getCell(2, 9)).toBe(first.indi); // Old Indi — today's bible
    expect(build.getCell(2, 10)).toBe(Math.round(first.sales * 0.01)); // New Indi — the fit
    expect(build.getCell(2, 12)).toBe(first.sales);
    expect(build.getCell(2, 13)).toBe(first.small);
    expect(build.getCell(2, 21)).toBe(first.sic);

    // And it keeps sharpening: a fourth day at a different rate moves it.
    fullDay(script, '2026-09-05', 10000, 200, 'regular');
    expect(build.getCell(2, 10)).not.toBe(Math.round(first.sales * 0.01));
  });

  it('peach days build the peach suggestion by date, leaving the regular one alone', () => {
    const script = freshDough();
    post(script, { ...biblesToPayload(bibles) });
    // No Bible cell on these — July dates fall to peach by the season rule.
    seedEon(script, '2026-07-01');
    fullDay(script, '2026-07-02', 4000, 40);
    fullDay(script, '2026-07-03', 6000, 60);
    fullDay(script, '2026-07-04', 8000, 80);
    expect(script.world.ss.getSheetByName('New Peach Bieblerb')!.getCell(2, 2)).toBe(4000);
    expect(script.world.ss.getSheetByName('New Peach Bieblerb')!.getCell(2, 10)).not.toBe('');
    expect(script.world.ss.getSheetByName('New Bieblerb')!.getCell(2, 10)).toBe('');
  });

  it("a 2 PM row's Bible cell outranks the date", () => {
    const script = freshDough();
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'peach'); // September, forced peach
    expect(script.world.ss.getSheetByName('New Peach Bieblerb')!.getCell(2, 2)).toBe(4000);
    expect(script.world.ss.getSheetByName('New Bieblerb')!.getCell(2, 2)).toBe('');
  });

  it('a count that ROSE overnight makes that size abstain, not go negative', () => {
    const script = freshDough();
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'regular');
    // Day 3: Small\'s 2 PM count is ABOVE last night\'s close — a miscount.
    post(script, {
      type: 'day', date: '2026-09-03',
      tabs: [
        { tab: '2PM Dough Count',
          row: { Date: '2026-09-03', 'Indi Count': 80, 'Small Count': 120,
            'Large Count': 80, 'Sic Count': 80, Bible: 'regular' } },
        { tab: 'Estimated Dough After Gang',
          row: { Date: '2026-09-03', Indi: 120, Small: 120, Large: 120, Sic: 120 } },
      ],
    });
    post(script, {
      type: 'eon', date: '2026-09-03',
      tabs: [{ tab: 'EON Dough Count',
        row: { Date: '2026-09-03', 'EON Sales': 6000, 'EON Indi Count': 100,
          'EON Small Count': 100, 'EON Large Count': 100, 'EON Sic Count': 100 } }],
    });
    const build = script.world.ss.getSheetByName('New Bieblerb')!;
    expect(build.getCell(3, 2)).toBe(6000);
    expect(build.getCell(3, 3)).toBe(40); // Indi: AM 20 + PM 20
    expect(build.getCell(3, 4)).toBe(''); // Small abstains — never a negative half
  });

  it('the morning looks back across closed days, but the trail goes cold at seven', () => {
    const script = freshDough();
    seedEon(script, '2026-09-01');
    // Closed the 2nd–4th: the 1st\'s close against the 5th\'s 2 PM is still the morning.
    fullDay(script, '2026-09-05', 4000, 40, 'regular');
    const build = script.world.ss.getSheetByName('New Bieblerb')!;
    expect(build.getCell(2, 2)).toBe(4000);
    expect(build.getCell(2, 3)).toBe(40);

    // A day fifteen days on has no last count within reach: no AM half, and a
    // PM-only figure must NOT be passed off as the whole day — no row at all.
    fullDay(script, '2026-09-20', 9000, 90, 'regular');
    expect(build.getCell(3, 1)).toBe('');
    expect(build.getCell(3, 2)).toBe('');
  });

  it('a day the gang total never reached abstains too — no half-day points', () => {
    const script = freshDough();
    seedEon(script, '2026-09-01');
    // 2 PM count and EON exist; Estimated Dough After Gang was never written.
    post(script, {
      type: 'day', date: '2026-09-02',
      tabs: [{ tab: '2PM Dough Count',
        row: { Date: '2026-09-02', 'Indi Count': 80, 'Small Count': 80,
          'Large Count': 80, 'Sic Count': 80, Bible: 'regular' } }],
    });
    post(script, {
      type: 'eon', date: '2026-09-02',
      tabs: [{ tab: 'EON Dough Count',
        row: { Date: '2026-09-02', 'EON Sales': 4000, 'EON Indi Count': 60,
          'EON Small Count': 60, 'EON Large Count': 60, 'EON Sic Count': 60 } }],
    });
    expect(script.world.ss.getSheetByName('New Bieblerb')!.getCell(2, 1)).toBe('');
  });

  it('a row posted by an old cached phone is accepted, then superseded by the rebuild', () => {
    const script = freshDough();
    seedEon(script, '2026-09-01');
    post(script, {
      type: 'day', date: '2026-09-02',
      tabs: [
        { tab: '2PM Dough Count',
          row: { Date: '2026-09-02', 'Indi Count': 80, 'Small Count': 80,
            'Large Count': 80, 'Sic Count': 80, Bible: 'regular' } },
        { tab: 'Estimated Dough After Gang',
          row: { Date: '2026-09-02', Indi: 120, Small: 120, Large: 120, Sic: 120 } },
      ],
    });
    // The old app writes its own phone-derived total alongside the EON save.
    const answer = post(script, {
      type: 'eon', date: '2026-09-02',
      tabs: [
        { tab: 'EON Dough Count',
          row: { Date: '2026-09-02', 'EON Sales': 4000, 'EON Indi Count': 100,
            'EON Small Count': 100, 'EON Large Count': 100, 'EON Sic Count': 100 } },
        { tab: 'New Bieblerb',
          row: { Date: '2026-09-02', 'Total Sales': 9999, Indi: 999, Small: 999, Large: 999, Sic: 999 } },
      ],
    });
    expect(answer.ok).toBe(true); // never rejected — stale caches are real
    const build = script.world.ss.getSheetByName('New Bieblerb')!;
    expect(build.getCell(2, 2)).toBe(4000); // the derived day, not the posted one
    expect(build.getCell(2, 3)).toBe(40); // AM 20 + PM 20
  });

  it('Erase all data really erases the fit history on the next refresh', () => {
    const script = freshDough();
    post(script, { ...biblesToPayload(bibles) });
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'regular');
    fullDay(script, '2026-09-03', 6000, 60, 'regular');
    fullDay(script, '2026-09-04', 8000, 80, 'regular');
    const build = script.world.ss.getSheetByName('New Bieblerb')!;
    expect(build.getCell(2, 10)).not.toBe('');

    script.fns.wipeAllData();
    script.fns.refreshBibleBuilds();
    expect(build.getCell(2, 2)).toBe(''); // history gone with the log
    expect(build.getCell(2, 10)).toBe(''); // and nothing suggested any more
  });
});

describe('the app can read the suggestion back for its graph', () => {
  type BibleRows = { sales: number; old: Record<string, number | null>; new: Record<string, number | null> }[];
  const read = (script: LoadedScript) =>
    (get(script, { action: 'bibles' }).bibles as Record<string, BibleRows>);

  it("pairs each threshold with today's bible and the suggestion", () => {
    const script = freshDough();
    post(script, { ...biblesToPayload(bibles) });
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'regular');
    fullDay(script, '2026-09-03', 6000, 60, 'regular');
    fullDay(script, '2026-09-04', 8000, 80, 'regular');

    const out = read(script);
    // One row per threshold in that bible — not per recorded day.
    expect(out.dough).toHaveLength(bibles.regular.rows.length);
    const first = bibles.regular.rows[0];
    expect(out.dough[0].sales).toBe(first.sales);
    expect(out.dough[0].old).toEqual({
      indi: first.indi, small: first.small, large: first.large, sic: first.sic,
    });
    // Whole-day use ran at 1% of sales on all four sizes, so the fit says so.
    expect(out.dough[0].new.indi).toBe(Math.round(first.sales * 0.01));
    expect(out.dough[0].new.sic).toBe(Math.round(first.sales * 0.01));
    // The last threshold comes back too, so the graph spans the whole bible.
    const last = bibles.regular.rows[bibles.regular.rows.length - 1];
    expect(out.dough[out.dough.length - 1].sales).toBe(last.sales);
  });

  it('reports "nothing suggested yet" as null, never as a zero', () => {
    const script = freshDough();
    post(script, { ...biblesToPayload(bibles) });
    seedEon(script, '2026-09-01');
    fullDay(script, '2026-09-02', 4000, 40, 'regular');
    fullDay(script, '2026-09-03', 6000, 60, 'regular'); // two days: under the gate

    const out = read(script);
    // Today's bible is known; the suggestion is not. A 0 here would draw a
    // line along the floor and read as "the new bible says make none".
    expect(out.dough[0].old.indi).toBe(bibles.regular.rows[0].indi);
    expect(out.dough[0].new.indi).toBeNull();
    // No peach days at all — that bible is simply empty, not zeroed.
    expect(out.peach.every((row) => row.new.indi === null)).toBe(true);
  });

  it('answers with an empty list rather than throwing when a tab is missing', () => {
    const script = freshDough();
    script.world.ss.deleteSheet(script.world.ss.getSheetByName('New Peach Bieblerb')!);
    const out = read(script);
    expect(out.peach).toEqual([]);
    expect(get(script, { action: 'bibles' }).ok).toBe(true);
  });

  it('is empty before any bible has been mirrored', () => {
    const script = freshDough();
    const out = read(script);
    expect(out.dough).toEqual([]);
    expect(out.peach).toEqual([]);
  });
});

describe('the bible mirror cannot go missing behind a stale memory', () => {
  it('rewrites the mirrors when they are empty, even though the hash matches', () => {
    const script = freshDough();
    expect(post(script, { ...biblesToPayload(bibles) }))
      .toMatchObject({ bibles: 'updated' });
    // An unchanged resend is still a no-op while the mirrors hold their rows.
    expect(post(script, { ...biblesToPayload(bibles) }))
      .toMatchObject({ bibles: 'unchanged' });

    // A wipe empties the sheet but not the script's memory of the last hash.
    script.world.ss.getSheetByName('Dough Bible')!.clear();
    expect(post(script, { ...biblesToPayload(bibles) }))
      .toMatchObject({ bibles: 'updated' });
    expect(script.world.ss.getSheetByName('Dough Bible')!.getLastRow())
      .toBe(bibles.regular.rows.length + 1);
  });
});

/**
 * The spreadsheet has its OWN timezone, separate from the Apps Script
 * project's. A date-only cell is stored as midnight in the SHEET's zone, so a
 * script asking the Date object for its own getDate() — which answers in the
 * SCRIPT's zone — reads the wrong day whenever the two disagree.
 *
 * The failure that causes is not a wrong date on screen. It is that the
 * merge-upsert stops recognising its own row: the incoming payload's date is a
 * string (never shifted), the stored cell is a Date (shifted), so they never
 * match and every save appends instead of merging. Silently, for ever.
 */
describe('dough script — the spreadsheet/script timezone trap', () => {
  const rowsOn = (script: LoadedScript, tab: string) => {
    const sheet = script.world.ss.getSheetByName(tab)!;
    let n = 0;
    for (let r = 2; r <= sheet.getLastRow(); r++) if (sheet.getCell(r, 1) !== '') n++;
    return n;
  };

  it('merges into the SAME row when the sheet runs ahead of the script', () => {
    const script = freshDough();
    script.world.ss.tzShiftHours = 13; // sheet's zone well ahead of the script's
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-01'));
    post(script, dayPayload('2026-08-01'));
    expect(rowsOn(script, '2PM Dough Count')).toBe(1);
  });

  it('a sheet running BEHIND the script was always safe — which is why this hid', () => {
    // Sheet-midnight lands later the same day in the script's zone, so the day
    // never shifts. Only a sheet ahead of the script breaks — which is what
    // makes the fault intermittent and easy to miss.
    const script = freshDough();
    script.world.ss.tzShiftHours = -11;
    post(script, dayPayload('2026-08-02'));
    post(script, dayPayload('2026-08-02'));
    expect(rowsOn(script, '2PM Dough Count')).toBe(1);
  });

  it('a shifted date still reads back as the day it was saved under', () => {
    const script = freshDough();
    script.world.ss.tzShiftHours = 13;
    post(script, dayPayload('2026-08-03'));
    const answer = get(script, { action: 'date', date: '2026-08-03' }) as {
      ok: boolean; tabs: Record<string, { Date: string } | null>;
    };
    expect(answer.ok).toBe(true);
    expect(answer.tabs['2PM Dough Count']?.Date).toBe('2026-08-03');
  });
});

describe('dough script — the columns must be where the app thinks', () => {
  it('refuses the save when a heading has been renamed, and says which', () => {
    const script = freshDough();
    script.world.ss.getSheetByName('2PM Dough Count')!.setCell(1, 6, 'Indi Balls');
    const answer = post(script, dayPayload('2026-08-01')) as { ok: boolean; error: string };
    expect(answer.ok).toBe(false);
    expect(answer.error).toContain('2PM Dough Count');
    expect(answer.error).toContain('F1');
    expect(answer.error).toContain('Indi Count');
  });

  it('refuses rather than writing into a shifted column', () => {
    const script = freshDough();
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    // Two headings swapped — the classic way values land in the wrong place.
    sheet.setCell(1, 6, 'Small Count');
    sheet.setCell(1, 7, 'Indi Count');
    expect(post(script, dayPayload('2026-08-01'))).toMatchObject({ ok: false });
    // Nothing was written: no data row exists at all.
    expect(sheet.getCell(2, 1)).toBe('');
  });

  it('a healthy tab saves exactly as before', () => {
    const script = freshDough();
    expect(post(script, dayPayload('2026-08-01'))).toMatchObject({ ok: true });
  });
});

describe('dough script — a stray value cannot push the next night into a gap', () => {
  it('appends after the last DATED row, not the last row of the whole sheet', () => {
    const script = freshDough();
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    post(script, dayPayload('2026-08-01')); // lands on row 2
    sheet.setCell(400, 5, 'a note someone typed'); // far down, unrelated column
    post(script, dayPayload('2026-08-02'));
    // Row 3, immediately under the first night — not row 401.
    expect(sheet.getCell(3, 1)).not.toBe('');
    // …and it is genuinely the second night, read back through the app's own path.
    const answer = get(script, { action: 'date', date: '2026-08-02' }) as {
      tabs: Record<string, { Date: string } | null>;
    };
    expect(answer.tabs['2PM Dough Count']?.Date).toBe('2026-08-02');
  });
});

describe('dough script — Check the log', () => {
  const runCheck = (script: LoadedScript) => {
    (script.fns as unknown as { checkLog(): void }).checkLog();
    return script.world.alerts[script.world.alerts.length - 1];
  };

  it('is on the Dough Tools menu', () => {
    const script = freshDough();
    script.fns.onOpen();
    expect(script.world.menu.map((m) => m.fn)).toContain('checkLog');
  });

  it('says so plainly when the notebook is healthy', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    expect(runCheck(script)).toContain('no day appears twice');
  });

  it('names a day that appears more than once — the app only reads the first', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    // A duplicate as a hand-paste would make it: same date, one row lower.
    const sheet = script.world.ss.getSheetByName('2PM Dough Count')!;
    sheet.setCell(3, 1, '2026-08-01');
    const report = runCheck(script);
    expect(report).toContain('2026-08-01');
    expect(report).toContain('more than one row');
  });

  it('names a heading that has been moved', () => {
    const script = freshDough();
    script.world.ss.getSheetByName('2PM Dough Count')!.setCell(1, 3, 'Sales So Far');
    expect(runCheck(script)).toContain('Current Sales');
  });

  it('counts rows whose date cannot be read', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    script.world.ss.getSheetByName('2PM Dough Count')!.setCell(3, 1, 'last tuesday');
    expect(runCheck(script)).toContain('cannot be read');
  });

  it('changes nothing it looks at', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    const before = get(script, { action: 'date', date: '2026-08-01' });
    runCheck(script);
    expect(get(script, { action: 'date', date: '2026-08-01' })).toEqual(before);
  });
});
