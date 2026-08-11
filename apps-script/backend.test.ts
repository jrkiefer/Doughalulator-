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

describe('dough script — validation', () => {
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

  it('accepts every tab the app fills, and refuses one it does not know', () => {
    const script = freshDough();
    expect(post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [{ tab: 'Final Make Amount', row: { Date: '2026-08-01', 'Indi Trays': 3 } }],
    }).ok).toBe(true);
    expect(String(post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [{ tab: 'Made Up Tab', row: { Date: '2026-08-01', Whatever: 3 } }],
    }).error)).toContain('unknown tab');
  });

  it('rejects an empty save and nonsensical negatives, but allows a negative sales-left', () => {
    const script = freshDough();
    expect(String(post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01' } }],
    }).error)).toContain('empty save');

    expect(String(post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01', 'Indi Count': -2 } }],
    }).error)).toContain('negative value');

    expect(post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '2026-08-01', 'Sales Left': -300 } }],
    }).ok).toBe(true);
  });
});

describe('dough script — merge-upsert + tolerant dates (§7)', () => {
  it('upserts by date: a second save updates the same row, never a duplicate', () => {
    const script = freshDough();
    post(script, dayPayload('2026-08-01'));
    post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
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
      secret: SECRET, type: 'day', date: '2026-08-01',
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
      secret: SECRET, type: 'eon', date: '2026-08-01',
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
    expect(ss.getSheetByName('EON Dough Count')!.headerRow(7)).toEqual([
      'Date', 'EON Sales', 'EON Indi Count', 'EON Small Count', 'EON Large Count',
      'EON Sic Count', 'EON Boli Count',
    ]);
    expect(ss.getSheetByName('Calculation Step Dough Make (estimate)')!.headerRow(10)).toEqual([
      'Date', 'Indi Trays', 'Small Trays', 'Large Trays', 'Sic Balls', 'Sic Trays',
      'Boli Trays', 'Batch Rounding', 'Trays Total', 'Batches',
    ]);
    expect(ss.getSheetByName('AM Dough Use')!.headerRow(7)[2]).toBe('AM Indi Use');
    expect(ss.getSheetByName('PM Dough Use')!.headerRow(7)[2]).toBe('PM Indi Use');
    expect(ss.getSheetByName('Estimated Dough Amount after Dough Gang')!.headerRow(6)).toEqual([
      'Date', 'Indi', 'Small', 'Large', 'Sic', 'Boli',
    ]);

    // The app is the only calculator: nothing in this sheet computes anything.
    for (const sheet of ss.sheets.values()) {
      expect(sheet.formulas.size).toBe(0);
    }
    expect(ss.getSheetByName('Bible Lookup (auto)')).toBeNull();
  });

  it('a save lands each number in its own tab, all in one post', () => {
    const script = freshDough();
    post(script, {
      secret: SECRET, type: 'day', date: '2026-08-01',
      tabs: [
        ...dayPayload('2026-08-01').tabs,
        { tab: 'Calculation Step Dough Make (estimate)',
          row: { Date: '2026-08-01', 'Indi Trays': 4, 'Trays Total': 78, Batches: 8 } },
        { tab: 'Estimated Dough Amount after Dough Gang',
          row: { Date: '2026-08-01', Indi: 64, Small: 378 } },
      ],
    });
    expect(script.world.ss.getSheetByName('Calculation Step Dough Make (estimate)')!
      .rowByIndex(2, 10)[9]).toBe('8');
    expect(script.world.ss.getSheetByName('Estimated Dough Amount after Dough Gang')!
      .getCell(2, 2)).toBe(64);
  });

  it('the retired layout can be cleared away once the new one is trusted', () => {
    const script = freshDough();
    script.world.ss.insertSheet('Summary');
    script.world.ss.insertSheet('Dough Use');
    expect(post(script, { secret: SECRET, type: 'retire', confirm: 'WIPE ALL DATA' }))
      .toMatchObject({ ok: true, removed: 2 });
    expect(script.world.ss.getSheetByName('Summary')).toBeNull();
    script.world.ss.insertSheet('Summary');
    expect(post(script, { secret: SECRET, type: 'retire' }).ok).toBe(false);
    expect(script.world.ss.getSheetByName('Summary')).not.toBeNull();
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
    expect(post(script, { secret: SECRET, ...biblesToPayload(bibles) }))
      .toMatchObject({ ok: true, bibles: 'updated' });

    const mirror = script.world.ss.getSheetByName('Dough Bible')!;
    bibles.regular.rows.forEach((row, i) => {
      expect(mirror.rowByIndex(6 + i, 5)).toEqual(
        [row.sales, row.indi, row.small, row.large, row.sic].map(String),
      );
    });

    expect(post(script, { secret: SECRET, ...biblesToPayload(bibles) }))
      .toMatchObject({ bibles: 'unchanged' });
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
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;

    // Without the confirm phrase nothing happens.
    expect(post(script, { secret: SECRET, type: 'wipe' }).ok).toBe(false);
    expect(input.getLastRow()).toBe(3);

    expect(post(script, { secret: SECRET, type: 'wipe', confirm: 'WIPE ALL DATA' }))
      .toMatchObject({ ok: true });
    expect(input.getLastRow()).toBe(1); // header only
    expect(input.headerRow(3)).toEqual(['Date', "Today's Forecast", 'Current Sales']);
    expect(script.world.ss.getSheetByName('Dough Bible')!.getLastRow()).toBeGreaterThan(5);
    // Life goes on: the next save starts cleanly at row 2.
    post(script, dayPayload('2026-08-03'));
    expect(input.getLastRow()).toBe(2);
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
      tabs: [{ tab: 'EON Dough Count', row: { Date: '2026-08-02', 'EON Sales': 9100 } }],
    });

    const one = get(script, { secret: SECRET, action: 'date', date: '2026-08-01' });
    const tabs = one.tabs as Record<string, Record<string, string> | null>;
    expect(one.ok).toBe(true);
    expect(tabs['2PM Dough Count']!["Today's Forecast"]).toBe('7200');
    expect(tabs['2PM Dough Count']!.Date).toBe('2026-08-01');
    // A tab with no row for this date reads null, not an empty object.
    expect(tabs['EON Dough Count']).toBeNull();

    // recent returns the same rows, newest dates last, one entry per date.
    const recent = get(script, { secret: SECRET, action: 'recent', n: '30' });
    const recentDates = recent.dates as Record<string, Record<string, Record<string, string> | null>>;
    expect(Object.keys(recentDates).sort()).toEqual(['2026-08-01', '2026-08-02']);
    expect(recentDates['2026-08-01']['2PM Dough Count']).toEqual(tabs['2PM Dough Count']);
    expect(recentDates['2026-08-02']['EON Dough Count']!['EON Sales']).toBe('9100');

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
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    // Someone hand-adds a second row for the same date, in another format.
    input.setCell(3, 1, '8/1/26');
    input.setCell(3, 2, 9999);

    const answer = get(script, { secret: SECRET, action: 'date', date: '2026-08-01' });
    const tabs = answer.tabs as Record<string, Record<string, string> | null>;
    expect(tabs['2PM Dough Count']!["Today's Forecast"]).toBe('7200'); // the first row wins
    // …and a save still merges into that same first row rather than the duplicate.
    post(script, {
      secret: SECRET,
      type: 'day',
      date: '8/1/26',
      tabs: [{ tab: '2PM Dough Count', row: { Date: '8/1/26', "Today's Forecast": 8100 } }],
    });
    expect(input.getCell(2, 2)).toBe(8100);
    expect(input.getCell(3, 2)).toBe(9999); // duplicate untouched
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
  it('keeps the header row and the sheet size a wipe should never shrink', () => {
    const script = freshDough();
    const input = script.world.ss.getSheetByName('2PM Dough Count')!;
    const maxRowsBefore = input.getMaxRows();
    post(script, dayPayload('2026-08-01'));
    expect(input.getLastRow()).toBe(2);

    expect(post(script, { secret: SECRET, type: 'wipe', confirm: 'WIPE ALL DATA' }).ok).toBe(true);
    expect(input.getLastRow()).toBe(1); // data gone
    expect(input.headerRow(2)[0]).toBe('Date'); // header intact
    // Deleting rows would have shrunk the sheet and its formats along with it.
    expect(input.getMaxRows()).toBe(maxRowsBefore);
  });
});
