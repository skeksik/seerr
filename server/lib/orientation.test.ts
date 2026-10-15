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
