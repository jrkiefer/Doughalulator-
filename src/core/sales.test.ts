import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { normalizeSales } from './sales';

const rule = defaultConfig.salesShorthand;

describe('normalizeSales (shorthand entry)', () => {
  it('expands 2.2 to 2,200', () => {
    expect(normalizeSales(2.2, rule)).toBe(2200);
  });

  it('expands 50 to 50,000', () => {
    expect(normalizeSales(50, rule)).toBe(50000);
  });

  it('expands 99 — still below the ceiling — to 99,000', () => {
    expect(normalizeSales(99, rule)).toBe(99000);
  });

  it('leaves 100 literal — the ceiling itself is a real dollar amount', () => {
    expect(normalizeSales(100, rule)).toBe(100);
  });

  it('keeps 0 as 0', () => {
    expect(normalizeSales(0, rule)).toBe(0);
  });

  it('expands small decimals cleanly (0.5 → 500)', () => {
    expect(normalizeSales(0.5, rule)).toBe(500);
  });

  it('leaves ordinary full-dollar entries alone (7200 → 7200)', () => {
    expect(normalizeSales(7200, rule)).toBe(7200);
  });
});
