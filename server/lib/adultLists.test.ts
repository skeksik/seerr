import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  mergeByDate,
  pickedAndExcluded,
  stashDbDate,
  tpdbDateOperations,
  withoutSeen,
} from '@server/lib/adultLists';
import type { Orientation } from '@server/lib/orientation';
import {
  joinedPlan,
  onlyUnidentified,
  planOrientationTags,
} from '@server/lib/orientation';

const ids = { straight: 1, lesbian: 8, gay: 1065, trans: 14025 };

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

  it('asks for a picked orientation tag once next to the same preference', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian', picked: [8, 8] },
      ids
    );

    assert.deepStrictEqual(plan.tagIds, [8]);
    assert.strictEqual(plan.empty, false);
    assert.strictEqual(plan.identified, true);
  });

  it('leaves picked tags alone when not narrowed', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian,gay', picked: [70] },
      ids,
      'none'
    );

    assert.deepStrictEqual(plan.tagIds, [70]);
    assert.strictEqual(plan.anyTag, false);
    assert.strictEqual(plan.narrowed, false);
  });

  it('names the tags of every hidden orientation', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'straight,lesbian,unidentified', picked: [] },
      ids
    );

    assert.deepStrictEqual(plan.hiddenTagIds, [1065, 14025]);
    assert.deepStrictEqual(plan.tagIds, []);
  });

  it('finds nothing when the orientation tags asked for are excluded', () => {
    for (const [orientation, picked, excluded] of [
      ['lesbian', [], [8]],
      ['lesbian', [70], [8]],
      ['lesbian,gay', [], [8, 1065]],
    ] as const) {
      const plan = planOrientationTags(
        undefined,
        { orientation, picked: [...picked], excluded: [...excluded] },
        ids
      );

      assert.strictEqual(plan.empty, true, `${orientation} ${excluded}`);
    }
  });

  it('asks for the shown orientations that are not excluded', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian,gay', picked: [], excluded: [8] },
      ids
    );

    assert.deepStrictEqual(plan.tagIds, [1065]);
    assert.strictEqual(plan.narrowed, true);
    assert.strictEqual(plan.empty, false);
  });

  it('filters for unidentified titles when the orientation tags are excluded', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'lesbian,unidentified', picked: [], excluded: [8] },
      ids
    );

    assert.strictEqual(plan.empty, false);
    assert.strictEqual(plan.narrowed, false);
    assert.deepStrictEqual(plan.tagIds, []);
  });

  it('finds nothing when a picked tag stands for a hidden orientation', () => {
    const plan = planOrientationTags(
      undefined,
      { orientation: 'straight', picked: [8] },
      ids
    );

    assert.strictEqual(plan.empty, true);
  });
});

describe('joinedPlan', () => {
  const plan = (
    narrowed: boolean,
    hidden: Orientation[] = [],
    identified = false
  ) => ({
    narrowed,
    identified,
    filter: { hidden: new Set(hidden) },
  });

  it('joins unidentified titles to narrowed lists that show them', () => {
    const joined = plan(false);

    assert.strictEqual(
      joinedPlan(plan(true), () => joined),
      joined
    );
    assert.strictEqual(
      joinedPlan(plan(true, ['unidentified']), () => plan(false)),
      undefined
    );
    // A picked orientation tag leaves no title unidentified
    assert.strictEqual(
      joinedPlan(plan(true, [], true), () => plan(false)),
      undefined
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

  it('tells a performer or tag both picked and excluded', () => {
    assert.strictEqual(
      pickedAndExcluded({ tags: [1, 2], tagsExclude: [2] }),
      true
    );
    assert.strictEqual(
      pickedAndExcluded({ performer: ['a'], performerExclude: ['a'] }),
      true
    );
    assert.strictEqual(
      pickedAndExcluded({ tags: [1], performerExclude: [1] }),
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
