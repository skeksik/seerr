import StashDbAPI from '@server/api/stashdb';
import type {
  StashDbPerformer,
  StashDbStudio,
  StashDbUrl,
} from '@server/api/stashdb/interfaces';
import TpdbAPI, { stashDbPerformerId, tpdbUrl } from '@server/api/tpdb';
import type {
  TpdbPerformerExtras,
  TpdbPerformerSummary,
  TpdbSiteSummary,
} from '@server/api/tpdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';

// A StashDB performer or studio and a ThePornDB one are the same when either
// links the other: StashDB keeps ThePornDB addresses among a performer's or
// studio's links, and ThePornDB keeps a StashDB link for performers (its
// sites have none). Linked ones have a single page, StashDB's, which adds
// ThePornDB's movies; the others keep a page each. Names alone never link

// Matches are kept like the details they come from
const MATCH_TTL = 21600;

// The stash-box instance ThePornDB's StashDB links must point to, when one
// is set up
const stashDbHost = (): string | undefined => {
  const { endpoint, apiKey } = getSettings().stashdb;

  if (!endpoint || !apiKey) {
    return undefined;
  }

  try {
    return new URL(endpoint).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return undefined;
  }
};

const TPDB_PROFILE =
  /^https?:\/\/(?:www\.)?theporndb\.net\/(performers|sites|studios)\/([\w-]+)\/?$/i;

// The ThePornDB performers or sites among StashDB links, by the id, uuid or
// slug in their address, which ThePornDB looks them up by. Studios are
// linked as sites/<slug> or, from older ThePornDB pages, studios/<uuid>
export const tpdbProfileIds = (
  urls: StashDbUrl[],
  type: 'performer' | 'studio'
): string[] =>
  urls.flatMap(({ url }) => {
    const [, kind, id] = url.trim().match(TPDB_PROFILE) ?? [];
    const matches =
      type === 'performer'
        ? kind?.toLowerCase() === 'performers'
        : kind?.toLowerCase() === 'sites' || kind?.toLowerCase() === 'studios';
    return matches && id ? [id] : [];
  });

// The addresses StashDB may keep for a ThePornDB performer or site; StashDB
// only finds exact ones
const performerUrls = (performer: TpdbPerformerRef): string[] => [
  tpdbUrl('performers', performer.id),
  ...(performer.slug ? [tpdbUrl('performers', performer.slug)] : []),
];

const siteUrls = (site: TpdbSiteRef): string[] => [
  ...(site.short_name ? [tpdbUrl('sites', site.short_name)] : []),
  tpdbUrl('sites', site.uuid),
  tpdbUrl('studios', site.uuid),
  tpdbUrl('sites', String(site.id)),
];

export interface TpdbPerformerRef {
  id: string;
  _id: number;
  slug?: string | null;
  extras?: TpdbPerformerExtras | null;
}

export type TpdbSiteRef = Pick<TpdbSiteSummary, 'id' | 'uuid' | 'short_name'>;

const cache = () => cacheManager.getCache('tpdb').data;

// ThePornDB performers whose StashDB link was seen, by their StashDB id, as
// ThePornDB cannot be asked for the performer behind a StashDB id
const rememberKey = (stashDbId: string) => `link:tpdb-performer:${stashDbId}`;

// The StashDB performers or studios holding each item's ThePornDB address;
// lists go on without links when StashDB fails
const findByTpdbUrls = async <T>(
  type: 'performer' | 'studio',
  items: T[],
  urls: (item: T) => string[],
  stashDb?: StashDbAPI
): Promise<(string | undefined)[]> => {
  if (items.length === 0) {
    return [];
  }

  const lists = items.map(urls);

  try {
    const ids = await (stashDb ?? StashDbAPI.fromSettings()).findIdsByUrls(
      type,
      lists.flat()
    );
    let next = 0;
    return lists.map((list) => {
      const found = ids.slice(next, next + list.length).find(Boolean);
      next += list.length;
      return found;
    });
  } catch (e) {
    logger.debug('Unable to look up ThePornDB links on StashDB', {
      label: 'API',
      type,
      errorMessage: e.message,
    });
    return items.map(() => undefined);
  }
};

// The StashDB performer each ThePornDB performer is linked to, by
// ThePornDB's numeric id
export const linkedStashDbPerformers = async (
  performers: TpdbPerformerRef[]
): Promise<Map<number, string>> => {
  const links = new Map<number, string>();
  const host = stashDbHost();

  if (!host) {
    return links;
  }

  for (const performer of performers) {
    const stashDbId = stashDbPerformerId(performer.extras, host);
    if (stashDbId) {
      links.set(performer._id, stashDbId);
      cache().set(rememberKey(stashDbId), performer._id, MATCH_TTL);
    }
  }

  // The rest, once each, by their address on StashDB
  const rest = [
    ...new Map(
      performers
        .filter((performer) => !links.has(performer._id))
        .map((performer) => [performer._id, performer])
    ).values(),
  ];
  const found = await findByTpdbUrls('performer', rest, performerUrls);
  rest.forEach((performer, i) => {
    const stashDbId = found[i];
    if (stashDbId) {
      links.set(performer._id, stashDbId);
    }
  });

  return links;
};

// The StashDB studio each ThePornDB site is linked to, by the site's id.
// Lists reading StashDB already pass its client
export const linkedStashDbStudios = async (
  sites: TpdbSiteRef[],
  stashDb?: StashDbAPI
): Promise<Map<number, string>> => {
  const links = new Map<number, string>();

  if (!stashDb && !stashDbHost()) {
    return links;
  }

  const unique = [...new Map(sites.map((site) => [site.id, site])).values()];
  const found = await findByTpdbUrls('studio', unique, siteUrls, stashDb);
  unique.forEach((site, i) => {
    const stashDbId = found[i];
    if (stashDbId) {
      links.set(site.id, stashDbId);
    }
  });

  return links;
};

// Lookups ThePornDB answers with null for ones it does not know
const firstFound = async <T>(
  ids: (string | number)[],
  load: (id: string | number) => Promise<T | null>
): Promise<T | null> => {
  for (const id of ids) {
    const found = await load(id);
    if (found) {
      return found;
    }
  }
  return null;
};

// Matches are kept as { match } so a miss is kept too
const cached = async <T>(
  key: string,
  find: () => Promise<T | null>
): Promise<T | null> => {
  const kept = cache().get<{ match: T | null }>(key);
  if (kept) {
    return kept.match;
  }

  const match = await find();
  cache().set(key, { match }, MATCH_TTL);
  return match;
};

// Names searched for a ThePornDB performer linking to a StashDB one
const SEARCHED_NAMES = 2;

// The ThePornDB performer linked to a StashDB performer: one StashDB links
// to, or one whose StashDB link is this performer. ThePornDB cannot be asked
// for that link, so its performers of the same name or alias are checked
export const tpdbPerformerFor = async (
  performer: StashDbPerformer
): Promise<TpdbPerformerSummary | null> => {
  const host = stashDbHost();

  if (!host || !TpdbAPI.isConfigured()) {
    return null;
  }

  const tpdb = TpdbAPI.fromSettings();

  return cached(`link:performer:${performer.id}`, async () => {
    const remembered = cache().get<number>(rememberKey(performer.id));
    const linked = await firstFound(
      [
        ...tpdbProfileIds(performer.urls, 'performer'),
        ...(remembered ? [remembered] : []),
      ],
      (id) => tpdb.getPerformer(id)
    );

    if (linked) {
      // Site performers point to the performer across all sites
      return linked.parent?._id
        ? ((await tpdb.getPerformer(linked.parent._id)) ?? linked)
        : linked;
    }

    const names = [...new Set([performer.name, ...performer.aliases])].slice(
      0,
      SEARCHED_NAMES
    );
    return firstFound(names, async (name) => {
      const found = await tpdb.searchPerformers(String(name));
      return (
        found.find(
          (candidate) =>
            stashDbPerformerId(candidate.extras, host) === performer.id
        ) ?? null
      );
    });
  });
};

// The ThePornDB site linked to a StashDB studio. Sites keep no StashDB
// links, so only the studio's own links count; with several, the first
// ThePornDB still has
export const tpdbSiteFor = async (
  studio: StashDbStudio
): Promise<TpdbSiteSummary | null> => {
  if (!TpdbAPI.isConfigured()) {
    return null;
  }

  const tpdb = TpdbAPI.fromSettings();
  const ids = tpdbProfileIds(studio.urls, 'studio');

  return ids.length === 0
    ? null
    : cached(`link:studio:${studio.id}`, () =>
        firstFound(ids, (id) => tpdb.getSite(id))
      );
};
