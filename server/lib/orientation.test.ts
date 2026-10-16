import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type {
  StashDbGender,
  StashDbSceneSummary,
} from '@server/api/stashdb/interfaces';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import { User } from '@server/entity/User';
import { UserSettings } from '@server/entity/UserSettings';
import type { Orientation } from '@server/lib/orientation';
import {
  classifyMovie,
  classifyScene,
  hiddenOrientations,
  isHidden,
  tagHint,
  tagsNeeded,
} from '@server/lib/orientation';

const tagIds = {
  orientations: { straight: 'straight', lesbian: 'lesbian', trans: 'trans' },
  missing: { female: 'missing-female' },
};

const scene = (
  genders: StashDbGender[],
  tags: string[] = []
): StashDbSceneSummary => ({
  id: 'scene',
  images: [],
  performers: genders.map((gender, i) => ({
    performer: { id: `p${i}`, name: `P${i}`, gender, images: [] },
  })),
  tags: tags.map((id) => ({ id })),
});

const movie = (genders: (string | null)[], tags: string[] = []): TpdbMovie =>
  ({
    id: 'movie',
    _id: 1,
    title: 'Movie',
    type: 'Movie',
    performers: genders.map((gender, i) => ({
      id: `p${i}`,
      _id: i,
      name: `P${i}`,
      extra: { gender },
    })),
    tags: tags.map((name, i) => ({ id: i, name })),
  }) as TpdbMovie;

describe('classifyScene', () => {
  it('trusts orientation tags', () => {
    assert.deepStrictEqual(
      classifyScene(scene(['FEMALE', 'FEMALE'], ['lesbian']), tagIds),
      ['lesbian']
    );
  });

  it('adds straight to a lesbian-tagged scene with a man in it', () => {
    assert.deepStrictEqual(
      classifyScene(scene(['FEMALE', 'MALE'], ['lesbian']), tagIds),
      ['straight', 'lesbian']
    );
  });

  it('takes a non-binary listed woman for a woman by her tags', () => {
    const named = {
      ...scene(['MALE', 'NON_BINARY' as StashDbGender]),
      tags: [
        { id: 'a', name: 'Asian Woman' },
        { id: 'b', name: 'Male - POV' },
      ],
    };
    assert.deepStrictEqual(classifyScene(named, tagIds), ['straight']);
  });

  it('reads the cast from body tags', () => {
    const named = (genders: StashDbGender[], names: string[]) => ({
      ...scene(genders),
      tags: names.map((name, i) => ({ id: `t${i}`, name })),
    });

    // A man listed without a gender, and a woman not listed at all
    assert.deepStrictEqual(
      classifyScene(
        named(['NON_BINARY' as StashDbGender], ['Big Dick', 'Big Tits']),
        tagIds
      ),
      ['straight']
    );
    // Trans performers have either
    assert.deepStrictEqual(
      classifyScene(named(['TRANSGENDER_FEMALE'], ['Big Dick']), tagIds),
      ['trans']
    );
    assert.deepStrictEqual(
      classifyScene(named(['MALE'], ['Big Tits', 'Trans Woman']), tagIds),
      ['gay']
    );
  });

  it('fills in the cast from group tags', () => {
    const withGroups = {
      ...tagIds,
      groups: { bgg: tagHint('Threesome (BGG)')! },
    };
    // Two women listed and the man missing: not a lesbian scene
    assert.deepStrictEqual(
      classifyScene(scene(['FEMALE', 'FEMALE'], ['bgg']), withGroups),
      ['straight']
    );
  });

  it('reads the cast of untagged scenes', () => {
    assert.deepStrictEqual(classifyScene(scene(['FEMALE', 'MALE']), tagIds), [
      'straight',
    ]);
    assert.deepStrictEqual(classifyScene(scene(['FEMALE', 'FEMALE']), tagIds), [
      'lesbian',
    ]);
    assert.deepStrictEqual(classifyScene(scene(['MALE', 'MALE']), tagIds), [
      'gay',
    ]);
    assert.deepStrictEqual(
      classifyScene(scene(['FEMALE', 'TRANSGENDER_FEMALE']), tagIds),
      ['trans']
    );
    // A lone woman suits both; no cast says nothing
    assert.deepStrictEqual(classifyScene(scene(['FEMALE']), tagIds), [
      'straight',
      'lesbian',
    ]);
    assert.deepStrictEqual(classifyScene(scene([]), tagIds), ['unidentified']);
  });

  it('counts performers StashDB is missing', () => {
    assert.deepStrictEqual(
      classifyScene(scene(['MALE'], ['missing-female']), tagIds),
      ['straight']
    );
  });

  it('adds trans for a trans performer next to other tags', () => {
    assert.deepStrictEqual(
      classifyScene(
        scene(['TRANSGENDER_FEMALE', 'MALE'], ['straight']),
        tagIds
      ),
      ['straight', 'trans']
    );
  });
});

describe('tagHint', () => {
  it('reads group and audience tags', () => {
    assert.deepStrictEqual(tagHint('Foursome (BBGT)'), {
      cast: { male: 2, female: 1, trans: 1 },
    });
    assert.deepStrictEqual(tagHint('Orgy (Lesbian)'), {
      orientation: 'lesbian',
    });
    assert.strictEqual(tagHint('Straight Hair'), undefined);
  });

  it('reads gender from tags about looks and roles', () => {
    assert.deepStrictEqual(tagHint('Asian Woman')?.cast?.female, 1);
    assert.deepStrictEqual(tagHint('Long Hair (Female)')?.cast?.female, 1);
    assert.deepStrictEqual(tagHint('Step Brother')?.cast?.male, 1);
    assert.deepStrictEqual(tagHint('Trans Woman'), { trans: true });
    assert.deepStrictEqual(tagHint('Big Tits')?.cast?.female, 1);
    assert.deepStrictEqual(tagHint('Big Dick')?.cast?.male, 1);
    assert.strictEqual(tagHint('Strap-On Cock'), undefined);
  });

  it('reads the performer behind the camera from point of view tags', () => {
    assert.deepStrictEqual(tagHint('Male - POV'), {
      cast: { male: 1, female: 0, trans: 0 },
    });
    assert.deepStrictEqual(tagHint('Blowjob - POV')?.cast?.male, 1);
    assert.deepStrictEqual(tagHint('POV')?.cast?.male, 1);
    assert.deepStrictEqual(tagHint('Pussy Licking - POV')?.cast?.female, 1);
    assert.deepStrictEqual(tagHint('Trans - POV')?.cast?.trans, 1);
    assert.strictEqual(tagHint('Kissing - POV'), undefined);
    assert.strictEqual(tagHint('Non-POV'), undefined);
  });
});

describe('classifyMovie', () => {
  it('reads ThePornDB tags, alone or in parentheses', () => {
    assert.deepStrictEqual(classifyMovie(movie([], ['Twosome (Gay)'])), [
      'gay',
    ]);
    assert.deepStrictEqual(classifyMovie(movie([], ['Futanari'])), ['futa']);
    // Not an orientation
    assert.deepStrictEqual(classifyMovie(movie([], ['Straight Hair'])), [
      'unidentified',
    ]);
  });

  it('counts the man behind a point of view camera', () => {
    // A lone woman would suit lesbian too
    assert.deepStrictEqual(classifyMovie(movie(['Female'], ['Male - POV'])), [
      'straight',
    ]);
  });

  it('reads the cast, whatever the case of the gender', () => {
    assert.deepStrictEqual(classifyMovie(movie(['Female', 'male'])), [
      'straight',
    ]);
    assert.deepStrictEqual(
      classifyMovie(movie(['Transgender Female', 'Male'])),
      ['trans']
    );
    assert.deepStrictEqual(classifyMovie(movie([null, null])), [
      'unidentified',
    ]);
  });
});

describe('isHidden', () => {
  const hidden = new Set<Orientation>(['gay', 'trans']);

  it('shows titles suiting any shown audience', () => {
    assert.strictEqual(isHidden(['straight', 'lesbian'], hidden), false);
    assert.strictEqual(isHidden(['gay'], hidden), true);
    assert.strictEqual(isHidden(['unidentified'], hidden), false);
  });

  it('hides titles with a hidden feature', () => {
    assert.strictEqual(isHidden(['straight', 'trans'], hidden), true);
    assert.strictEqual(
      isHidden(['straight', 'trans'], new Set<Orientation>(['straight'])),
      false
    );
  });
});

describe('tagsNeeded', () => {
  it('asks for tagged titles only without straight', () => {
    assert.deepStrictEqual(
      tagsNeeded(new Set<Orientation>(['straight', 'lesbian', 'bisexual'])),
      ['gay', 'trans', 'futa']
    );
    assert.deepStrictEqual(tagsNeeded(new Set<Orientation>(['gay'])), []);
  });
});

describe('hiddenOrientations', () => {
  const user = (settings: Partial<UserSettings>) => {
    const u = new User({
      email: 'adult@seerr.dev',
      permissions: 0,
      avatar: '',
    });
    u.settings = new UserSettings(settings);
    return u;
  };

  it('hides the unchecked ones until picked, and the disabled ones always', () => {
    const u = user({
      uncheckedOrientations: ['gay'],
      disabledOrientations: ['futa'],
    });

    assert.deepStrictEqual([...hiddenOrientations(u)].sort(), ['futa', 'gay']);
    assert.deepStrictEqual(
      [...hiddenOrientations(u, 'gay,futa,straight')].sort(),
      ['bisexual', 'futa', 'lesbian', 'trans', 'unidentified']
    );
    // A pick that shows nothing counts as no pick
    assert.deepStrictEqual([...hiddenOrientations(u, 'none')].sort(), [
      'futa',
      'gay',
    ]);
  });

  it('hides nothing by default', () => {
    assert.strictEqual(hiddenOrientations(user({})).size, 0);
    assert.strictEqual(hiddenOrientations(undefined).size, 0);
  });
});
