import assert from 'node:assert/strict';
import { afterEach, describe, it, mock } from 'node:test';

import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaType } from '@server/constants/media';
import {
  findWhisparrItem,
  lookupWhisparrItem,
  whisparrServiceUrl,
} from '@server/lib/whisparrMedia';

const STASH_ID = '01a0de25-5c7e-75b7-b319-ee76dd9a4879';

const whisparr = new WhisparrAPI({
  url: 'http://whisparr.test:6969/api/v3',
  apiKey: 'key',
});

const scene = {
  mediaType: MediaType.SCENE,
  tmdbId: null,
  stashId: STASH_ID,
};

const item = (overrides: Partial<WhisparrItem>) =>
  ({ id: 9, title: 'Scene', stashId: STASH_ID, ...overrides }) as WhisparrItem;

afterEach(() => {
  mock.restoreAll();
});

describe('findWhisparrItem', () => {
  it('takes the library item by its known id', async () => {
    mock.method(WhisparrAPI.prototype, 'getItem', async () => item({}));
    const lookup = mock.method(WhisparrAPI.prototype, 'lookupScene');

    assert.strictEqual((await findWhisparrItem(whisparr, scene, 9)).id, 9);
    assert.strictEqual(lookup.mock.callCount(), 0);
  });

  it('looks the title up when the id is another title or gone', async () => {
    const lookup = mock.method(WhisparrAPI.prototype, 'lookupScene', async () =>
      item({ id: 12 })
    );
    mock.method(WhisparrAPI.prototype, 'getItem', async () =>
      item({ stashId: 'other' })
    );

    assert.strictEqual((await findWhisparrItem(whisparr, scene, 9)).id, 12);

    mock.method(WhisparrAPI.prototype, 'getItem', async () => {
      throw new Error('404', { cause: { response: { status: 404 } } });
    });

    assert.strictEqual((await findWhisparrItem(whisparr, scene, 9)).id, 12);
    assert.strictEqual(lookup.mock.callCount(), 2);
  });
});

describe('lookupWhisparrItem', () => {
  it('needs an id Whisparr knows the title by', async () => {
    await assert.rejects(() =>
      lookupWhisparrItem(whisparr, {
        mediaType: MediaType.ADULT_MOVIE,
        tmdbId: null,
        tpdbId: null,
      })
    );
  });
});

describe('whisparrServiceUrl', () => {
  it('prefers the external address, without a doubled slash', () => {
    const server = {
      hostname: 'whisparr.test',
      port: 6969,
      useSsl: false,
    } as Parameters<typeof whisparrServiceUrl>[0];

    assert.strictEqual(
      whisparrServiceUrl(server, '/movie/a'),
      'http://whisparr.test:6969/movie/a'
    );
    assert.strictEqual(
      whisparrServiceUrl(
        { ...server, externalUrl: 'https://whisparr.example/' },
        '/movie/a'
      ),
      'https://whisparr.example/movie/a'
    );
  });
});
