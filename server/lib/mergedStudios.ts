import type StashDbAPI from '@server/api/stashdb';
import type TpdbAPI from '@server/api/tpdb';
import type { TpdbSiteSummary } from '@server/api/tpdb/interfaces';
import type { SceneFilterDetails } from '@server/models/Scene';
import { pickImage } from '@server/models/Scene';

type StashDbStudio = Awaited<
  ReturnType<StashDbAPI['queryStudios']>
>['studios'][number];

export interface MergedStudio extends SceneFilterDetails {
  // ThePornDB sites with no StashDB studio of their name
  source?: 'tpdb';
  imageType?: 'tpdb';
}

// Names that differ only in case, spaces, punctuation or a domain ending
// are one studio
const nameKey = (name: string): string =>
  name
    .toLowerCase()
    .replace(/\.(com|net|org|xxx|tv)$/, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

// ThePornDB lists clip store channels, like "Manyvids: Someone", as sites;
// they are single creators rather than studios
const isClipChannel = (name: string): boolean => /^[^:]{2,24}:\s/.test(name);

const byName = (a: string, b: string): number =>
  a.localeCompare(b, 'en', { sensitivity: 'base' });

// StashDB studios read ahead, so a ThePornDB site is checked against the
// StashDB names next to it
const LOOKAHEAD = 20;

interface Source<T> {
  items: T[];
  next: number;
  done: boolean;
  total: number;
}

// StashDB studios and the ThePornDB sites StashDB has no studio for, both by
// name. Neither can be paged into the other, so the list is merged from the
// start as far as it is read, and kept for the next page
export class MergedStudioList {
  private merged: MergedStudio[] = [];
  private stashDbNames = new Set<string>();
  private stashDb: Source<StashDbStudio> = {
    items: [],
    next: 1,
    done: false,
    total: 0,
  };
  private tpdb: Source<TpdbSiteSummary> = {
    items: [],
    next: 1,
    done: false,
    total: 0,
  };
  private reading: Promise<unknown> = Promise.resolve();

  constructor(
    private readonly stashDbApi: StashDbAPI,
    private readonly tpdbApi: TpdbAPI,
    private readonly query?: string
  ) {}

  public get done(): boolean {
    return (
      this.stashDb.done &&
      this.tpdb.done &&
      this.stashDb.items.length === 0 &&
      this.tpdb.items.length === 0
    );
  }

  // Merged so far, or an upper bound while reading
  public get total(): number {
    return this.done
      ? this.merged.length
      : Math.max(this.merged.length, this.stashDb.total + this.tpdb.total);
  }

  public async page(page: number, perPage: number): Promise<MergedStudio[]> {
    // One read at a time, as each picks up where the last stopped
    const read = this.reading.then(() => this.readTo(page * perPage));
    this.reading = read.catch(() => undefined);
    await read;

    return this.merged.slice((page - 1) * perPage, page * perPage);
  }

  private async readStashDb(): Promise<void> {
    const { count, studios } = await this.stashDbApi.queryStudios({
      page: this.stashDb.next,
      perPage: 100,
      sort: 'NAME',
      name: this.query,
    });
    this.stashDb.next += 1;
    this.stashDb.total = count;
    this.stashDb.items.push(...studios);
    this.stashDb.done = studios.length < 100;
  }

  private async readTpdb(): Promise<void> {
    const { data, meta } = await this.tpdbApi.listSites(
      this.tpdb.next,
      this.query
    );
    this.tpdb.next += 1;
    this.tpdb.total = meta.total;
    this.tpdb.items.push(...data);
    this.tpdb.done = meta.current_page >= meta.last_page || data.length === 0;
  }

  private async readTo(wanted: number): Promise<void> {
    while (this.merged.length < wanted && !this.done) {
      await Promise.all([
        this.stashDb.items.length < LOOKAHEAD && !this.stashDb.done
          ? this.readStashDb()
          : undefined,
        this.tpdb.items.length === 0 && !this.tpdb.done
          ? this.readTpdb()
          : undefined,
      ]);

      const studio = this.stashDb.items[0];
      const site = this.tpdb.items[0];

      if (studio && (!site || byName(studio.name, site.name) <= 0)) {
        this.stashDb.items.shift();
        this.stashDbNames.add(nameKey(studio.name));
        // Networks are listed apart
        if (studio.child_studios.length === 0) {
          this.merged.push({
            id: studio.id,
            name: studio.name,
            imageUrl: pickImage(studio.images),
          });
        }
      } else if (site) {
        this.tpdb.items.shift();
        const key = nameKey(site.name);
        if (
          !isClipChannel(site.name) &&
          !this.stashDbNames.has(key) &&
          !this.stashDb.items.some(({ name }) => nameKey(name) === key)
        ) {
          this.merged.push({
            id: String(site.id),
            name: site.name,
            imageUrl: site.logo ?? undefined,
            source: 'tpdb',
            imageType: 'tpdb',
          });
        }
      }
    }
  }
}

// Kept for an hour, as the list is read on while it is scrolled
const LIST_TTL = 60 * 60 * 1000;
const MAX_LISTS = 20;
const lists = new Map<string, { list: MergedStudioList; expires: number }>();

export const mergedStudioList = (
  stashDbApi: StashDbAPI,
  tpdbApi: TpdbAPI,
  query?: string
): MergedStudioList => {
  const key = (query ?? '').toLowerCase();
  const now = Date.now();
  const kept = lists.get(key);

  if (kept && kept.expires > now) {
    return kept.list;
  }

  for (const [listKey, { expires }] of lists) {
    if (expires <= now) {
      lists.delete(listKey);
    }
  }
  if (lists.size >= MAX_LISTS) {
    lists.delete(lists.keys().next().value as string);
  }

  const list = new MergedStudioList(stashDbApi, tpdbApi, query);
  lists.set(key, { list, expires: now + LIST_TTL });
  return list;
};
