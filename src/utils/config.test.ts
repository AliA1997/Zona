import { getMissingConfig } from '@/utils/config';

describe('getMissingConfig', () => {
  it('returns the names of unset or empty variables only', () => {
    expect(
      getMissingConfig({ A: 'set', B: undefined, C: '' })
    ).toEqual(['B', 'C']);
  });

  it('returns nothing when every variable is set', () => {
    expect(getMissingConfig({ A: 'x', B: 'y' })).toEqual([]);
  });
});
