import { describe, expect, it } from 'vitest';
import { toBinMutationBody } from '../../src/utils/studentBin';

describe('toBinMutationBody', () => {
  it('uses the backend recordId field for recycle-bin mutations', () => {
    expect(toBinMutationBody({ recordType: 'dailyProgress', recordId: 'daily-1' })).toEqual({
      recordType: 'dailyProgress',
      recordId: 'daily-1',
    });
  });
});
