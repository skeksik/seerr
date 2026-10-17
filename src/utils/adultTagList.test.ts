import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatAdultTags, isAdultTagId, parseAdultTags } from './adultTagList';

const STASH_A = '0c3b6a5e-3d2f-4f8e-9b1a-2c3d4e5f6a7b';
const STASH_B = 'f1e2d3c4-b5a6-4789-8abc-def012345678';

describe('formatAdultTags', () => {
  it('joins ids and names', () => {
    assert.strictEqual(
      formatAdultTags([
        { id: '70', name: 'Anal' },
        { id: '13316', name: 'Anal Masturbation' },
      ]),
      '70:Anal,13316:Anal Masturbation'
    );
  });

  it('escapes commas and backslashes in names, but not colons', () => {
    assert.strictEqual(
      formatAdultTags([{ id: '1', name: 'Big, Bold\\Tag: Two' }]),
      '1:Big\\, Bold\\\\Tag: Two'
    );
  });

  it('writes a plain id for a tag without a name', () => {
    assert.strictEqual(formatAdultTags([{ id: '5', name: '' }]), '5');
    assert.strictEqual(formatAdultTags([]), '');
  });
});

describe('parseAdultTags', () => {
  it('reads back what was copied', () => {
    const tags = [
      { id: '70', name: 'Anal' },
      { id: '2', name: 'Big, Bold\\Tag: Two' },
      { id: '3', name: 'Ends with a backslash\\' },
    ];

    assert.deepStrictEqual(
      parseAdultTags('adultmovie', formatAdultTags(tags)),
      { tags, errors: [] }
    );
  });

  it('reads plain ids, and ids with names, in one list', () => {
    assert.deepStrictEqual(
      parseAdultTags('scene', ` ${STASH_A} , ${STASH_B}: Blonde `),
      {
        tags: [{ id: STASH_A }, { id: STASH_B, name: 'Blonde' }],
        errors: [],
      }
    );
  });

  it('treats an empty name as a plain id', () => {
    assert.deepStrictEqual(parseAdultTags('adultmovie', '70:'), {
      tags: [{ id: '70' }],
      errors: [],
    });
  });

  it('keeps the first of repeated ids', () => {
    assert.deepStrictEqual(
      parseAdultTags('scene', `${STASH_A}:One,${STASH_A.toUpperCase()}:Two`),
      { tags: [{ id: STASH_A, name: 'One' }], errors: [] }
    );
  });

  it('reads a list over several lines', () => {
    assert.deepStrictEqual(parseAdultTags('adultmovie', '1:A,\n2:B\r\n3:C'), {
      tags: [
        { id: '1', name: 'A' },
        { id: '2', name: 'B' },
        { id: '3', name: 'C' },
      ],
      errors: [],
    });
  });

  it('rejects ids of the other kind', () => {
    assert.deepStrictEqual(parseAdultTags('scene', '70:Anal'), {
      tags: [],
      errors: [{ type: 'invalidId', entry: '70:Anal' }],
    });
    assert.deepStrictEqual(parseAdultTags('adultmovie', `${STASH_A},0,-3`), {
      tags: [],
      errors: [
        { type: 'invalidId', entry: STASH_A },
        { type: 'invalidId', entry: '0' },
        { type: 'invalidId', entry: '-3' },
      ],
    });
  });

  it('rejects a name without an id', () => {
    assert.deepStrictEqual(parseAdultTags('adultmovie', 'Anal'), {
      tags: [],
      errors: [{ type: 'invalidId', entry: 'Anal' }],
    });
  });

  it('rejects empty entries and leading or trailing commas', () => {
    for (const text of [',1', '1,', '1,,2', '']) {
      assert.deepStrictEqual(
        parseAdultTags('adultmovie', text).errors,
        [{ type: 'emptyEntry' }],
        text
      );
    }
  });

  it('rejects a backslash with nothing after it', () => {
    assert.deepStrictEqual(parseAdultTags('adultmovie', '1:A\\'), {
      tags: [],
      errors: [{ type: 'danglingEscape' }],
    });
    assert.deepStrictEqual(parseAdultTags('adultmovie', '1:A\\\n2:B'), {
      tags: [],
      errors: [{ type: 'danglingEscape' }],
    });
  });
});

describe('isAdultTagId', () => {
  it('takes UUIDs for StashDB and numbers for ThePornDB', () => {
    assert.strictEqual(isAdultTagId('scene', STASH_A), true);
    assert.strictEqual(isAdultTagId('scene', '70'), false);
    assert.strictEqual(isAdultTagId('adultmovie', '70'), true);
    assert.strictEqual(isAdultTagId('adultmovie', '07'), false);
    assert.strictEqual(isAdultTagId('adultmovie', STASH_A), false);
  });
});
