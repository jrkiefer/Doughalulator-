/**
 * In-process Apps Script harness: enough of SpreadsheetApp, LockService,
 * ContentService, and PropertiesService to run both Code.gs files inside
 * Vitest. The fake sheet is a sparse 1-based grid; display values are the
 * String() of what was set (Sheets' date coercion is out of scope — the
 * scripts normalize dates themselves, which is exactly what we test).
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

type Cell = string | number;

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
    return this.getValues().map((row) => row.map((v) => (v === '' ? '' : String(v))));
  }

  getDisplayValue(): string {
    return this.getDisplayValues()[0][0];
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

class NoopRange {
  setNumberFormat() {
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
  private maxRow = 0;

  constructor(public name: string) {}

  setCell(row: number, col: number, value: Cell) {
    if (value === '' || value === null || value === undefined) {
      this.grid.delete(`${row}:${col}`);
    } else {
      this.grid.set(`${row}:${col}`, value);
    }
    // Once a row was written it counts toward lastRow even if later cleared —
    // close enough to Sheets for these tests.
    if (value !== '' && row > this.maxRow) this.maxRow = row;
  }

  getCell(row: number, col: number): Cell {
    return this.grid.get(`${row}:${col}`) ?? '';
  }

  getRange(a: number | string, b?: number, c?: number, d?: number) {
    if (typeof a === 'string') return new NoopRange();
    return new FakeRange(this, a, b!, c ?? 1, d ?? 1);
  }

  getLastRow() {
    return this.maxRow;
  }

  getMaxRows() {
    return 1000;
  }

  setFrozenRows(n: number) {
    this.frozenRows = n;
  }

  appendRow(values: Cell[]) {
    const row = this.getLastRow() + 1;
    values.forEach((v, i) => this.setCell(row, i + 1, v));
    return this;
  }

  clear() {
    this.grid.clear();
    this.formulas.clear();
    this.maxRow = 0;
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

  getSheetByName(name: string) {
    return this.sheets.get(name) ?? null;
  }

  insertSheet(name: string) {
    const sheet = new FakeSheet(name);
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
        addItem: () => menu,
        addToUi: () => undefined,
      };
      return { createMenu: () => menu };
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

  return { SpreadsheetApp, LockService, ContentService, PropertiesService };
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
  'normalizeDate',
  'findDateRow',
  'writeBibles',
];

/** Evaluate a Code.gs file against a fresh fake world and hand back its functions. */
export function loadScript(file: 'dough' | 'temps', secret = 'TEST-SECRET'): LoadedScript {
  const here = dirname(fileURLToPath(import.meta.url));
  let code = readFileSync(join(here, file, 'Code.gs'), 'utf8');
  code = code.replace("var SECRET = 'PASTE-YOUR-SECRET-HERE';", `var SECRET = '${secret}';`);

  const world: FakeWorld = {
    ss: new FakeSpreadsheet(),
    lock: { busy: false, acquired: 0, released: 0 },
    props: new Map(),
  };
  const globals = makeGlobals(world);

  const body = `${code}\n;return {${EXPORTS.map((n) => `${n}: typeof ${n} === 'function' ? ${n} : undefined`).join(',')}};`;
  const factory = new Function(
    'SpreadsheetApp',
    'LockService',
    'ContentService',
    'PropertiesService',
    body,
  );
  const fns = factory(
    globals.SpreadsheetApp,
    globals.LockService,
    globals.ContentService,
    globals.PropertiesService,
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
