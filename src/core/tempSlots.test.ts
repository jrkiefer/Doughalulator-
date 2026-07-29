import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../config';
import { slotForTime } from './tempSlots';

describe('slotForTime (before 11:00 → Morning; 11:00–17:00 → 2 PM; after → Night)', () => {
  it('early morning through 10:59 is Morning', () => {
    expect(slotForTime('00:00', defaultConfig)).toBe('morning');
    expect(slotForTime('06:30', defaultConfig)).toBe('morning');
    expect(slotForTime('10:59', defaultConfig)).toBe('morning');
  });

  it('11:00 through 17:00 inclusive is the 2 PM slot', () => {
    expect(slotForTime('11:00', defaultConfig)).toBe('midday');
    expect(slotForTime('14:00', defaultConfig)).toBe('midday');
    expect(slotForTime('17:00', defaultConfig)).toBe('midday');
  });

  it('after 17:00 is Night', () => {
    expect(slotForTime('17:01', defaultConfig)).toBe('night');
    expect(slotForTime('23:59', defaultConfig)).toBe('night');
  });
});
