import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { stashUrl } from '@server/api/stash';
import splitStashUrl from '@server/lib/settings/migrations/0010_split_stash_url';

describe('stashUrl', () => {
  it('builds the address and leaves out default ports', () => {
    assert.strictEqual(
      stashUrl({ hostname: 'stash', port: 9999, useSsl: false, urlBase: '' }),
      'http://stash:9999'
    );
    assert.strictEqual(
      stashUrl({
        hostname: 'stash.example.com',
        port: 443,
        useSsl: true,
        urlBase: '/stash',
      }),
      'https://stash.example.com/stash'
    );
  });
});

describe('0010_split_stash_url', () => {
  it('splits a saved URL into its parts', () => {
    const settings = splitStashUrl({
      stash: { url: 'https://stash.example.com/base/', apiKey: 'key' },
    });

    assert.deepStrictEqual(settings.stash, {
      hostname: 'stash.example.com',
      port: 443,
      useSsl: true,
      urlBase: '/base',
      apiKey: 'key',
    });
    assert.deepStrictEqual(settings.migrations, ['0010_split_stash_url']);
  });

  it('keeps explicit ports and drops an empty URL', () => {
    assert.strictEqual(
      splitStashUrl({ stash: { url: 'http://10.0.0.5:9999', apiKey: 'k' } })
        .stash.port,
      9999
    );
    assert.deepStrictEqual(
      splitStashUrl({ stash: { url: '', apiKey: '' } }).stash,
      { apiKey: '' }
    );
  });
});
