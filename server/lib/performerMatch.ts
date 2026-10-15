// StashDB and ThePornDB do not always link their performers to each other,
// and names repeat. A same-named performer only counts as a match when the
// two share a profile link, such as IAFD or Twitter.

const normalizeLink = (url: string): string =>
  url
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\/(www\.)?/, '')
    .replace(/\/+$/, '');

export const sharesLink = (a: string[], b: string[]): boolean => {
  const links = new Set(a.map(normalizeLink));
  return b.some((url) => links.has(normalizeLink(url)));
};

export const sameName = (name: string, names: (string | undefined)[]) =>
  names.some((other) => other?.toLowerCase() === name.toLowerCase());
