import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../config';
import { keepTypedSplit } from './counts';

const bpt = defaultConfig.ballsPerTray;

describe('a count coming back from the sheet keeps the split this phone typed', () => {
  it('same total: the typed boxes stay exactly as typed', () => {
    const fetched = { smallTrays: '22', smallSingles: '0', largeTrays: '22', largeSingles: '0' };
    const typed = { smallTrays: '20', smallSingles: '16', largeTrays: '22', largeSingles: '' };
    expect(keepTypedSplit(fetched, typed, bpt)).toMatchObject(typed);
  });

  it('different total: the other phone changed it, so the sheet wins', () => {
    const fetched = { smallTrays: '23', smallSingles: '0' };
    const typed = { smallTrays: '22', smallSingles: '' };
    expect(keepTypedSplit(fetched, typed, bpt)).toMatchObject({ smallTrays: '23', smallSingles: '0' });
  });

  it('blank is not zero: a typed 0 and an uncounted size are different counts', () => {
    const fetched = { indiTrays: '0', indiSingles: '0', boliTrays: '', boliSingles: '' };
    const typed = { indiTrays: '', indiSingles: '', boliTrays: '', boliSingles: '0' };
    expect(keepTypedSplit(fetched, typed, bpt)).toMatchObject(fetched);
  });

  it('no phone copy at all: the sheet figure is used as it came', () => {
    const fetched = { indiTrays: '2', indiSingles: '0' };
    expect(keepTypedSplit(fetched, undefined, bpt)).toEqual(fetched);
  });
});
