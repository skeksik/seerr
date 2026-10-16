import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  hasPickedFilters,
  mergeByDate,
  stashDbDate,
  tpdbDateOperations,
  withSuggestion,
  withoutSeen,
} from '@server/lib/adultLists';
import type { Orientation } from '@server/lib/orientation';
import {
  joinedPlan,
  onlyUnidentified,
  planOrientationTags,
} from '@server/lib/orientation';

const ids = { lesbian: 8, gay: 1065, trans: 14025 };

describe('planOrientationTags', () => {
  it('asks for any shown orientation without straight', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian,gay', picked: [] },
      ids
    );

    assert.deepStrictEqual(plan.tagIds, [8, 1065]);
    assert.strictEqual(plan.anyTag, true);
    assert.strictEqual(plan.narrowed, true);
  });

  it('adds a lone shown orientation to all picked tags', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian', picked: [70] },
      ids
    );

    assert.deepStrictEqual(plan.tagIds, [70, 8]);
    assert.strictEqual(plan.anyTag, false);
  });

  it('leaves picked tags alone when not narrowed', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian,gay', picked: [70], tagMode: 'or' },
      ids,
      'none'
    );

    assert.deepStrictEqual(plan.tagIds, [70]);
    assert.strictEqual(plan.anyTag, true);
    assert.strictEqual(plan.narrowed, false);
  });
});

describe('joinedPlan', () => {
  const plan = (narrowed: boolean, hidden: Orientation[] = []) => ({
    narrowed,
    filter: { hidden: new Set(hidden) },
  });

  it('joins unidentified titles to narrowed lists that show them', () => {
    const joined = joinedPlan(plan(true), () => plan(false));

    assert.strictEqual(joined?.unidentified, true);
    assert.strictEqual(
      joinedPlan(plan(true, ['unidentified']), () => plan(false)),
      undefined
    );
  });

  it('joins tagged titles shown beside straight', () => {
    assert.strictEqual(
      joinedPlan(plan(false), () => plan(true))?.unidentified,
      false
    );
    assert.strictEqual(
      joinedPlan(plan(false), () => plan(false)),
      undefined
    );
  });

  it('keeps only unidentified titles in the joined filter', () => {
    const { hidden } = onlyUnidentified({ hidden: new Set<Orientation>() });

    assert.strictEqual(hidden.has('unidentified'), false);
    assert.strictEqual(hidden.has('straight'), true);
  });
});

describe('list helpers', () => {
  it('merges by release date and leaves other orders as they are', () => {
    const a = { id: 'a', date: '2026-01-01' };
    const b = { id: 'b', date: '2026-03-01' };
    const c = { id: 'c', date: '2026-02-01' };
    const idsOf = (items: { id: string }[]) => items.map(({ id }) => id);

    assert.deepStrictEqual(
      idsOf(mergeByDate([a, b], [c], (item) => item.date, 'DESC')),
      ['b', 'c', 'a']
    );
    assert.deepStrictEqual(
      idsOf(mergeByDate([a, b], [c], (item) => item.date)),
      ['a', 'b', 'c']
    );
    assert.deepStrictEqual(idsOf(withoutSeen([a, c], [a, b])), ['c']);
  });

  it('adds suggestions alone or next to the picked values', () => {
    const filters = { performer: [1], tags: [2], tagMode: 'or' as const };

    assert.deepStrictEqual(
      withSuggestion(filters, 'performer', 3, {}).performer,
      [1, 3]
    );
    assert.deepStrictEqual(withSuggestion(filters, 'tag', 3, {}).tags, [3]);
    assert.deepStrictEqual(
      withSuggestion(filters, 'studio', 3, { performer: [9] }).performer,
      [9]
    );
  });

  it('does not count how fields combine as a pick', () => {
    assert.strictEqual(
      hasPickedFilters({ tagMode: 'or', released: 'after', tags: undefined }),
      false
    );
    assert.strictEqual(hasPickedFilters({ orientation: 'gay' }), true);
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
