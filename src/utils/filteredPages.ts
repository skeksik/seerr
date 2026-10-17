// Filtered lists end after this many empty pages in a row, as when only
// unidentified scenes are picked, rather than read hundreds more
export const EMPTY_PAGES_LIMIT = 3;

// Whether the last pages read all came back empty, so a filtered list ends
export const emptyPagesInARow = (
  pages: { results: unknown[] }[] | undefined,
  limit = EMPTY_PAGES_LIMIT
): boolean =>
  !!pages &&
  pages.length >= limit &&
  pages.slice(-limit).every((page) => page.results.length === 0);
