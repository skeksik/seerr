// The copy and import format of the StashDB and ThePornDB tag blocklists:
// tags separated by commas, each its id and name joined by a colon, as in
// `70:Anal,13316:Anal Masturbation`. Unlike TMDB keywords, ThePornDB tags
// cannot be looked up by id, so the names travel with the ids. A backslash
// keeps the character after it in a name, so names may hold commas
// (`\,`) and backslashes (`\\`); a name's colons need no escape, as ids
// have none. Plain ids, without a name, are read too.

export type AdultTagKind = 'scene' | 'adultmovie';

export interface AdultTag {
  id: string;
  name: string;
}

// A tag read from a list; plain ids have no name
export interface ParsedAdultTag {
  id: string;
  name?: string;
}

export type AdultTagListError =
  // A comma with nothing before or after it
  | { type: 'emptyEntry' }
  // A backslash at the very end, with nothing to keep
  | { type: 'danglingEscape' }
  // Not a StashDB tag UUID or ThePornDB tag number
  | { type: 'invalidId'; entry: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NUMBER = /^[1-9]\d*$/;

// StashDB tags are UUIDs, ThePornDB tags positive numbers
export const isAdultTagId = (kind: AdultTagKind, id: string): boolean =>
  (kind === 'scene' ? UUID : NUMBER).test(id);

const escapeName = (name: string): string => name.replace(/[\\,]/g, '\\$&');

export const formatAdultTags = (tags: AdultTag[]): string =>
  tags
    .map(({ id, name }) => (name ? `${id}:${escapeName(name)}` : id))
    .join(',');

// Splits at the commas no backslash keeps, leaving the escapes in place
const splitEntries = (text: string): string[] | null => {
  const entries: string[] = [];
  let current = '';

  for (let i = 0; i < text.length; i++) {
    const char = text[i];

    if (char === '\\') {
      if (i + 1 >= text.length) {
        return null;
      }
      current += char + text[i + 1];
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

const unescape = (text: string): string => text.replace(/\\(.)/g, '$1');

export const parseAdultTags = (
  kind: AdultTagKind,
  text: string
): { tags: ParsedAdultTag[]; errors: AdultTagListError[] } => {
  // Pasted lists may span lines, which then separate tags too, whether or
  // not a comma ends them
  const lines = text.trim().split(/\s*[\r\n]+\s*/);
  const danglingLine = lines.some((line) => /(^|[^\\])(\\\\)*\\$/.test(line));
  const entries =
    !danglingLine &&
    splitEntries(
      lines
        .map((line, index) =>
          index < lines.length - 1
            ? line.replace(/(^|[^\\])((?:\\\\)*),$/, '$1$2')
            : line
        )
        .join(',')
    );

  if (!entries) {
    return { tags: [], errors: [{ type: 'danglingEscape' }] };
  }

  const tags: ParsedAdultTag[] = [];
  const errors: AdultTagListError[] = [];
  const seen = new Set<string>();

  for (const entry of entries) {
    const trimmed = entry.trim();

    if (trimmed === '') {
      if (!errors.some((error) => error.type === 'emptyEntry')) {
        errors.push({ type: 'emptyEntry' });
      }
      continue;
    }

    const colon = trimmed.indexOf(':');
    const id = (colon === -1 ? trimmed : trimmed.slice(0, colon)).trim();
    const name = colon === -1 ? '' : unescape(trimmed.slice(colon + 1)).trim();

    if (!isAdultTagId(kind, id)) {
      errors.push({ type: 'invalidId', entry: unescape(trimmed) });
      continue;
    }

    // StashDB's UUIDs are kept as StashDB writes them
    const key = kind === 'scene' ? id.toLowerCase() : id;

    if (!seen.has(key)) {
      seen.add(key);
      tags.push(name ? { id: key, name } : { id: key });
    }
  }

  return { tags, errors };
};
