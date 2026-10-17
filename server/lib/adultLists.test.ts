import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  pickedAndExcluded,
  stashDbDate,
  tpdbDateOperations,
} from '@server/lib/adultLists';

describe('list helpers', () => {
  it('tells a performer or tag both picked and excluded', () => {
    assert.strictEqual(
      pickedAndExcluded({ tags: [1, 2], excludeTags: [2] }),
      true
    );
    assert.strictEqual(
      pickedAndExcluded({ performer: ['a'], excludePerformers: ['a'] }),
      true
    );
    assert.strictEqual(
      pickedAndExcluded({ tags: [1], excludePerformers: [1] }),
      false
    );
    assert.strictEqual(pickedAndExcluded({}), false);
  });
});

describe('release date comparisons', () => {
  it('moves StashDB bounds a day for or-equal comparisons', () => {
    assert.deepStrictEqual(stashDbDate('2025-03-01', 'gte'), {
      value: '2025-02-28',
      modifier: 'GREATER_THAN',
    });
    assert.deepStrictEqual(stashDbDate('2025-02-28', 'lte'), {
      value: '2025-03-01',
      modifier: 'LESS_THAN',
    });
    assert.deepStrictEqual(stashDbDate('2025-02-28', 'eq'), {
      value: '2025-02-28',
      modifier: 'EQUALS',
    });
    assert.strictEqual(tpdbDateOperations.lte, '<=');
  });
});
