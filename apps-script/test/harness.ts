/**
 * In-process Apps Script harness: enough of SpreadsheetApp, LockService,
 * ContentService, and PropertiesService to run both Code.gs files inside
 * Vitest. The fake sheet is a sparse 1-based grid.
 *
 * Sheets' date coercion IS modelled: text written into a column formatted
 * 'yyyy-mm-dd' is stored as a real Date and reads back as one from
 * getValues(), while getDisplayValues() renders it ISO. A merge-upsert that
 * matched on the raw value instead of the display value once appended a
 * duplicate row on every save, and the harness could not see it — so the
 * quirk that hid the bug is now part of the fake.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Cell = string | number | Date;

const HOUR_MS = 60 * 60 * 1000;

/** Render an instant in the SHEET's zone — `shift` hours ahead of the script's. */
export function renderInSheetZone(value: Date, shiftHours: number): string {
  const shifted = new Date(value.getTime() + shiftHours * HOUR_MS);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${shifted.getFullYear()}-${pad(shifted.getMonth() + 1)}-${pad(shifted.getDate())}`;
}

/**
 * How Sheets renders a stored cell: dates ISO in the SPREADSHEET's timezone,
 * everything else as text. The zone matters — a script asking a Date object
 * for its own getDate() answers in the SCRIPT project's zone instead, and when
 * the two differ that is a whole day's disagreement.
 */
function display(value: Cell, shiftHours = 0): string {
  if (value === '') return '';
  if (value instanceof Date) return renderInSheetZone(value, shiftHours);
  return String(value);
}

class FakeRange {
  constructor(
    private sheet: FakeSheet,
    private row: number,
    private col: number,
    private numRows = 1,
    private numCols = 1,
  ) {}

  setValues(values: Cell[][]) {
    values.forEach((rowVals, r) =>
      rowVals.forEach((v, c) => this.sheet.setCell(this.row + r, this.col + c, v)),
    );
    return this;
  }

  setValue(value: Cell) {
    this.sheet.setCell(this.row, this.col, value);
    return this;
  }

  getValues(): Cell[][] {
    const out: Cell[][] = [];
    for (let r = 0; r < this.numRows; r++) {
      const line: Cell[] = [];
      for (let c = 0; c < this.numCols; c++) line.push(this.sheet.getCell(this.row + r, this.col + c));
      out.push(line);
    }
    return out;
  }

  getDisplayValues(): string[][] {
    const shift = this.sheet.tzShiftHours();
    return this.getValues().map((row) => row.map((v) => display(v, shift)));
  }

  getDisplayValue(): string {
    return this.getDisplayValues()[0][0];
  }

  /** Erase the cells but keep the rows — formats and rule ranges survive. */
  clearContent() {
    for (let r = 0; r < this.numRows; r++) {
      for (let c = 0; c < this.numCols; c++) {
        this.sheet.setCell(this.row + r, this.col + c, '');
      }
    }
    return this;
  }

  setFormula(formula: string) {
    this.sheet.formulas.set(`${this.row}:${this.col}`, formula);
    return this;
  }

  setFontWeight() {
    return this;
  }

  setNumberFormat() {
    return this;
  }

  getColumn() {
    return this.col;
  }

  getRow() {
    return this.row;
  }
}

/** A whole-column range (e.g. 'A2:A') — only its formatting calls matter here. */
class ColumnRange {
  constructor(
    private sheet: FakeSheet,
    private column: number,
  ) {}

  setNumberFormat(format: string) {
    // Sheets PARSES text written into a date-formatted cell and stores a real
    // Date. Modelling that is the point: code reading such a column back with
    // getValues() gets Date objects, not the strings it wrote.
    if (/y+.*m+.*d+/i.test(format)) this.sheet.dateColumns.add(this.column);
    return this;
  }

  setFontWeight() {
    return this;
  }
}

export class FakeSheet {
  grid = new Map<string, Cell>(); // "row:col" (1-based)
  formulas = new Map<string, string>();
  rules: unknown[] = [];
  frozenRows = 0;
  /** Columns formatted as dates — writes of date-like text become Date objects. */
  dateColumns = new Set<number>();
  hidden = false;
  private maxRows = 1000; // a fresh Google sheet's row ceiling

  constructor(
    public name: string,
    /** How many hours the SHEET's timezone runs ahead of the script's. */
    public tzShiftHours: () => number = () => 0,
  ) {}

  setCell(row: number, col: number, value: Cell) {
    if (value === '' || value === null || value === undefined) {
      this.grid.delete(`${row}:${col}`);
    } else {
      this.grid.set(`${row}:${col}`, this.coerce(row, col, value));
    }
  }

  /** Date-formatted columns store dates, exactly as Sheets does (header row excluded). */
  private coerce(row: number, col: number, value: Cell): Cell {
    if (row === 1 || !this.dateColumns.has(col) || typeof value !== 'string') return value;
    const iso = value.trim().match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!iso) return value;
    // Sheets stores midnight IN THE SPREADSHEET'S ZONE. With the sheet ahead of
    // the script, that instant is the previous day to the script — which is the
    // entire timezone trap, modelled rather than assumed.
    const local = new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
    return new Date(local.getTime() - this.tzShiftHours() * HOUR_MS);
  }

  getCell(row: number, col: number): Cell {
    return this.grid.get(`${row}:${col}`) ?? '';
  }

  getRange(a: number | string, b?: number, c?: number, d?: number) {
    if (typeof a === 'string') {
      const column = a.trim().charCodeAt(0) - 64; // 'A2:A' → 1
      return new ColumnRange(this, column);
    }
    return new FakeRange(this, a, b!, c ?? 1, d ?? 1);
  }

  /** The last row holding anything — content, not history, exactly like Sheets. */
  getLastRow() {
    const rows = [...this.grid.keys(), ...this.formulas.keys()].map((k) => Number(k.split(':')[0]));
    return rows.length ? Math.max(...rows) : 0;
  }

  getMaxRows() {
    return this.maxRows;
  }

  /** Grow the sheet, as Apps Script does when a write needs more room. */
  insertRowsAfter(after: number, count: number) {
    if (after >= this.maxRows) this.maxRows += count;
    return this;
  }

  setFrozenRows(n: number) {
    this.frozenRows = n;
  }

  hideSheet() {
    this.hidden = true;
    return this;
  }

  getName() {
    return this.name;
  }

  appendRow(values: Cell[]) {
    const row = this.getLastRow() + 1;
    values.forEach((v, i) => this.setCell(row, i + 1, v));
    return this;
  }

  /** Remove rows [startRow, startRow+numRows), shifting everything below up. */
  deleteRows(startRow: number, numRows: number) {
    const shift = <T>(entries: Map<string, T>) => {
      const next = new Map<string, T>();
      for (const [key, value] of entries) {
        const [r, c] = key.split(':').map(Number);
        if (r >= startRow && r < startRow + numRows) continue;
        next.set(`${r >= startRow + numRows ? r - numRows : r}:${c}`, value);
      }
      return next;
    };
    this.grid = shift(this.grid);
    this.formulas = shift(this.formulas);
    this.maxRows -= numRows;
  }

  clear() {
    this.grid.clear();
    this.formulas.clear();
    return this;
  }

  getConditionalFormatRules() {
    return this.rules;
  }

  setConditionalFormatRules(rules: unknown[]) {
    this.rules = rules;
  }

  /** Test helpers */
  headerRow(width: number): string[] {
    return new FakeRange(this, 1, 1, 1, width).getDisplayValues()[0];
  }

  rowByIndex(row: number, width: number): string[] {
    return new FakeRange(this, row, 1, 1, width).getDisplayValues()[0];
  }
}

export class FakeSpreadsheet {
  sheets = new Map<string, FakeSheet>();
  private name = 'Untitled spreadsheet';
  /**
   * Hours the spreadsheet's timezone runs AHEAD of the script project's.
   * 0 = the two agree (the healthy case). Anything else reproduces the
   * classic Apps Script off-by-one.
   */
  tzShiftHours = 0;

  getSpreadsheetTimeZone() {
    return 'Fake/SheetZone';
  }

  getSheetByName(name: string) {
    return this.sheets.get(name) ?? null;
  }

  insertSheet(name: string) {
    const sheet = new FakeSheet(name, () => this.tzShiftHours);
    this.sheets.set(name, sheet);
    return sheet;
  }

  deleteSheet(sheet: FakeSheet) {
    this.sheets.delete(sheet.name);
  }

  rename(name: string) {
    this.name = name;
  }

  getName() {
    return this.name;
  }
}

export interface FakeWorld {
  ss: FakeSpreadsheet;
  lock: { busy: boolean; acquired: number; released: number };
  props: Map<string, string>;
  /** Menu items registered by onOpen — so registration can be asserted. */
  menu: { caption: string; fn: string }[];
  /** Text passed to Ui.alert — how checkLog reports to the owner. */
  alerts: string[];
}

interface RuleBuilder {
  whenFormulaSatisfied(f: string): RuleBuilder;
  setFontColor(c: string): RuleBuilder;
  setRanges(r: unknown[]): RuleBuilder;
  build(): { getRanges(): unknown[] };
}

function makeGlobals(world: FakeWorld) {
  const SpreadsheetApp = {
    getActive: () => world.ss,
    newConditionalFormatRule(): RuleBuilder {
      let ranges: unknown[] = [];
      const builder: RuleBuilder = {
        whenFormulaSatisfied: () => builder,
        setFontColor: () => builder,
        setRanges: (r: unknown[]) => {
          ranges = r;
          return builder;
        },
        build: () => ({ getRanges: () => ranges }),
      };
      return builder;
    },
    getUi() {
      const menu = {
        addItem: (caption: string, fn: string) => {
          world.menu.push({ caption, fn });
          return menu;
        },
        addToUi: () => undefined,
      };
      return {
        createMenu: () => menu,
        // alert(prompt) | alert(prompt, buttons) | alert(title, prompt, buttons)
        alert: (...args: string[]) => {
          world.alerts.push(args.length >= 3 ? args[1] : args[0]);
          return 'ok';
        },
        ButtonSet: { YES_NO: 'YES_NO', OK: 'OK' },
        Button: { YES: 'YES', NO: 'NO' },
      };
    },
  };

  const Utilities = {
    /**
     * Renders in the zone it is GIVEN, unlike Date's own getters which always
     * answer in the script's zone. Only the one format the scripts use is
     * supported — an unexpected format should fail loudly, not silently.
     */
    formatDate(date: Date, _tz: string, format: string) {
      if (format !== 'yyyy-MM-dd') {
        throw new Error('fake Utilities.formatDate only knows yyyy-MM-dd, got: ' + format);
      }
      return renderInSheetZone(date, world.ss.tzShiftHours);
    },
  };

  const LockService = {
    getScriptLock: () => ({
      tryLock: () => {
        if (world.lock.busy) return false;
        world.lock.acquired++;
        return true;
      },
      releaseLock: () => {
        world.lock.released++;
      },
    }),
  };

  const ContentService = {
    MimeType: { JSON: 'application/json' },
    createTextOutput: (text: string) => ({
      setMimeType: () => ({ getContent: () => text, text }),
      getContent: () => text,
      text,
    }),
  };

  const PropertiesService = {
    getScriptProperties: () => ({
      getProperty: (k: string) => world.props.get(k) ?? null,
      setProperty: (k: string, v: string) => void world.props.set(k, v),
    }),
  };

  return { SpreadsheetApp, LockService, ContentService, PropertiesService, Utilities };
}

export interface LoadedScript {
  world: FakeWorld;
  fns: Record<string, (...args: unknown[]) => unknown>;
}

const EXPORTS = [
  'setup',
  'onOpen',
  'doPost',
  'doGet',
  'rebuildDoughUse',
  'generateFittedBibles',
  'theilSen',
  'refreshBibleBuilds',
  'normalizeDate',
  'findDateRow',
  'writeBibles',
  'wipeAllData',
  'removeRetiredTabs',
  'checkLog',
  'logProblems',
];

/** Evaluate a Code.gs file against a fresh fake world and hand back its functions. */
export function loadScript(file: 'dough' | 'temps'): LoadedScript {
  // The real scripts sit beside this test folder, in apps-script/<file>/Code.gs.
  const here = dirname(fileURLToPath(import.meta.url));
  const code = readFileSync(join(here, '..', file, 'Code.gs'), 'utf8');

  const world: FakeWorld = {
    ss: new FakeSpreadsheet(),
    lock: { busy: false, acquired: 0, released: 0 },
    props: new Map(),
    menu: [],
    alerts: [],
  };
  const globals = makeGlobals(world);

  const body = `${code}\n;return {${EXPORTS.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(',')}};`;
  const factory = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    'PropertiesService',
    'Utilities',
    body,
  );
  const fns = factory(
    globals.SpreadsheetApp,
    globals.LockService,
    globals.ContentService,
    globals.PropertiesService,
    globals.Utilities,
  ) as LoadedScript['fns'];

  return { world, fns };
}

/** Run doPost with a JSON body and parse the JSON answer. */
export function post(script: LoadedScript, body: object): Record<string, unknown> {
  const out = script.fns.doPost({ postData: { contents: JSON.stringify(body) } }) as {
    getContent(): string;
  };
  return JSON.parse(out.getContent()) as Record<string, unknown>;
}

/** Run doGet with query params and parse the JSON answer. */
export function get(script: LoadedScript, params: Record<string, string>): Record<string, unknown> {
  const out = script.fns.doGet({ parameter: params }) as { getContent(): string };
  return JSON.parse(out.getContent()) as Record<string, unknown>;
}
