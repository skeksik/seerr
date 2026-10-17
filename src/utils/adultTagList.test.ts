import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  formatAdultTags,
  isStashDbTagId,
  parseAdultTags,
} from './adultTagList';

const STASH_A = '0c3b6a5e-3d2f-4f8e-9b1a-2c3d4e5f6a7b';
const STASH_B = 'f1e2d3c4-b5a6-4789-8abc-def012345678';

describe('formatAdultTags', () => {
  it('copies StashDB tag ids', () => {
    assert.strictEqual(
      formatAdultTags('scene', [
        { id: STASH_A, name: 'Anal' },
        { id: STASH_B, name: 'Blonde' },
      ]),
      `${STASH_A},${STASH_B}`
    );
  });

  it('copies ThePornDB tag names, keeping commas in them', () => {
    assert.strictEqual(
      formatAdultTags('adultmovie', [
        { id: '70', name: 'Anal' },
        { id: '2', name: 'Big, Bold\\Tag' },
      ]),
      'Anal,Big\\, Bold\\\\Tag'
    );
    assert.strictEqual(formatAdultTags('adultmovie', []), '');
  });
});

describe('parseAdultTags', () => {
  it('reads back what was copied', () => {
    const tags = [
      { id: '70', name: 'Anal' },
      { id: '2', name: 'Big, Bold\\Tag' },
    ];

    assert.deepStrictEqual(
      parseAdultTags('adultmovie', formatAdultTags('adultmovie', tags)),
      { entries: ['Anal', 'Big, Bold\\Tag'], errors: [] }
    );
  });

  it('reads StashDB tag ids', () => {
    assert.deepStrictEqual(
      parseAdultTags('scene', ` ${STASH_A} , ${STASH_B.toUpperCase()} `),
      { entries: [STASH_A, STASH_B], errors: [] }
    );
  });

  it('keeps the first of repeated tags', () => {
    assert.deepStrictEqual(
      parseAdultTags('scene', `${STASH_A},${STASH_A.toUpperCase()}`),
      { entries: [STASH_A], errors: [] }
    );
    assert.deepStrictEqual(parseAdultTags('adultmovie', 'Anal,anal'), {
      entries: ['Anal'],
      errors: [],
    });
  });

  it('reads a list over several lines', () => {
    assert.deepStrictEqual(
      parseAdultTags('adultmovie', 'Anal,\nBlonde\r\n\n  Teen,\n'),
      { entries: ['Anal', 'Blonde', 'Teen'], errors: [] }
    );
  });

  it('rejects what is not a StashDB tag id', () => {
    assert.deepStrictEqual(parseAdultTags('scene', `70,${STASH_A}:Anal`), {
      entries: [],
      errors: [
        { type: 'invalidId', entry: '70' },
        { type: 'invalidId', entry: `${STASH_A}:Anal` },
      ],
    });
  });

  it('rejects empty entries', () => {
    for (const text of [',Anal', 'Anal,,Teen', '']) {
      assert.deepStrictEqual(
        parseAdultTags('adultmovie', text).errors,
        [{ type: 'emptyEntry' }],
        text
      );
    }
  });
});

describe('isStashDbTagId', () => {
  it('takes UUIDs', () => {
    assert.strictEqual(isStashDbTagId(STASH_A), true);
    assert.strictEqual(isStashDbTagId('70'), false);
  });
});
