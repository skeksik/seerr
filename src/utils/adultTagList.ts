// The copy and import format of the StashDB and ThePornDB tag blocklists,
// in what each looks tags up by, like TMDB keyword ids upstream: StashDB
// tag ids, and ThePornDB tag names, as ThePornDB finds tags by name only.
// Tags are separated by commas or lines; a name with a comma in it keeps it
// as `\,`

export type AdultTagKind = 'scene' | 'adultmovie';

export type AdultTagListError =
  // A comma with nothing before or after it
  | { type: 'emptyEntry' }
  // Not a StashDB tag id
  | { type: 'invalidId'; entry: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isStashDbTagId = (id: string): boolean => UUID.test(id);

export const formatAdultTags = (
  kind: AdultTagKind,
  tags: { id: string; name: string }[]
): string =>
  tags
    .map(({ id, name }) =>
      kind === 'scene' ? id : name.replace(/\\/g, '\\\\').replace(/,/g, '\\,')
    )
    .join(',');

// The entries, split at the commas no backslash keeps
const splitEntries = (text: string): string[] => {
  const entries: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\\' && i + 1 < text.length) {
      current += text[i + 1];
      i++;
    } else if (char === ',') {
      entries.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  entries.push(current);
  return entries;
};

// StashDB tag ids, or ThePornDB tag names, from a pasted list
export const parseAdultTags = (
  kind: AdultTagKind,
  text: string
): { entries: string[]; errors: AdultTagListError[] } => {
  // Lines are separated like commas, and a comma may end one
  const lines = text
    .split(/\r\n|\r|\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => (/(^|[^\\]),$/.test(line) ? line.slice(0, -1) : line));
  const raw = splitEntries(lines.join(',')).map((entry) => entry.trim());
  const entries: string[] = [];
  const errors: AdultTagListError[] = [];
  const seen = new Set<string>();

  for (const entry of raw) {
    if (entry === '') {
      if (!errors.some((error) => error.type === 'emptyEntry')) {
        errors.push({ type: 'emptyEntry' });
      }
      continue;
    }

    if (kind === 'scene' && !isStashDbTagId(entry)) {
      errors.push({ type: 'invalidId', entry });
      continue;
    }

    const key = entry.toLowerCase();

    if (!seen.has(key)) {
      seen.add(key);
      entries.push(kind === 'scene' ? key : entry);
    }
  }

  return { entries, errors };
};
