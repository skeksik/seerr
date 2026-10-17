import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { EMPTY_PAGES_LIMIT, emptyPagesInARow } from './filteredPages';

const pages = (...counts: number[]) =>
  counts.map((count) => ({ results: Array.from({ length: count }) }));

describe('emptyPagesInARow', () => {
  it('ends a list after enough empty pages in a row', () => {
    assert.strictEqual(EMPTY_PAGES_LIMIT, 3);
    assert.strictEqual(emptyPagesInARow(pages(0, 0, 0)), true);
    assert.strictEqual(emptyPagesInARow(pages(4, 1, 0, 0, 0)), true);
  });

  it('reads on while pages still find titles, or too few were read', () => {
    assert.strictEqual(emptyPagesInARow(undefined), false);
    assert.strictEqual(emptyPagesInARow(pages(0, 0)), false);
    assert.strictEqual(emptyPagesInARow(pages(0, 0, 1)), false);
    assert.strictEqual(emptyPagesInARow(pages(0, 1, 0, 0)), false);
  });
});
