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
  name?: string;
  slug?: string | null;
  extras?: TpdbPerformerExtras | null;
}

export type TpdbSiteRef = Pick<TpdbSiteSummary, 'id' | 'uuid' | 'short_name'> &
  Partial<Pick<TpdbSiteSummary, 'name'>>;

const cache = () => cacheManager.getCache('tpdb').data;

// ThePornDB performers whose StashDB link was seen, by their StashDB id, as
// ThePornDB cannot be asked for the performer behind a StashDB id
const rememberKey = (stashDbId: string) => `link:tpdb-performer:${stashDbId}`;

// The StashDB performers or studios holding each item's ThePornDB address;
// lists go on without links when StashDB fails
const findByTpdbUrls = async <T extends { name?: string }>(
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
      lists.flat(),
      lists.flatMap((list, i) => list.map(() => items[i].name))
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

// How a StashDB performer or studio was linked to a ThePornDB one: by its
// own StashDB links, by the ThePornDB performer's, or, for a network, by
// its studios'. Whisparr only reads StashDB's, so it monitors the movies
// of the first alone
export type LinkVia = 'stashdb' | 'tpdb' | 'network';

export interface TpdbLink<T> {
  match: T;
  via: LinkVia;
}

// The ThePornDB performer linked to a StashDB performer: one StashDB links
// to, or one whose StashDB link is this performer. ThePornDB cannot be asked
// for that link, so its performers of the same name or alias are checked
export const tpdbPerformerFor = async (
  performer: StashDbPerformer
): Promise<TpdbLink<TpdbPerformerSummary> | null> => {
  const host = stashDbHost();

  if (!host || !TpdbAPI.isConfigured()) {
    return null;
  }

  const tpdb = TpdbAPI.fromSettings();
  // Site performers point to the performer across all sites
  const acrossSites = async (linked: TpdbPerformerSummary) =>
    linked.parent?._id
      ? ((await tpdb.getPerformer(linked.parent._id)) ?? linked)
      : linked;

  // link2: the kept match says how it was found; link: did not
  return cached(`link2:performer:${performer.id}`, async () => {
    const linked = await firstFound(
      tpdbProfileIds(performer.urls, 'performer'),
      (id) => tpdb.getPerformer(id)
    );

    if (linked) {
      return { match: await acrossSites(linked), via: 'stashdb' };
    }

    // One seen linking back, in a list
    const remembered = cache().get<number>(rememberKey(performer.id));
    const seen = remembered ? await tpdb.getPerformer(remembered) : null;

    if (seen) {
      return { match: await acrossSites(seen), via: 'tpdb' };
    }

    const names = [...new Set([performer.name, ...performer.aliases])].slice(
      0,
      SEARCHED_NAMES
    );
    const found = await firstFound(names, async (name) => {
      const found = await tpdb.searchPerformers(String(name));
      return (
        found.find(
          (candidate) =>
            stashDbPerformerId(candidate.extras, host) === performer.id
        ) ?? null
      );
    });
    return found && { match: found, via: 'tpdb' };
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
    : cached(`link:studio:${studio.id}`, async () => {
        const site = await firstFound(ids, (id) => tpdb.getSite(id));
        if (!site) {
          return null;
        }
        // Several studios can link one site, like Blacked and Adult Time x
        // Blacked; it belongs to the one its own links lead to, so its
        // movies show on one page only
        const owner = (await linkedStashDbStudios([site])).get(site.id);
        return !owner || owner === studio.id ? site : null;
      });
};

// Studios of a network whose links are read, and ThePornDB sites of them
// looked up, for the network's own ThePornDB site
const NETWORK_STUDIOS = 50;
const NETWORK_SITES = 6;

// The ThePornDB network of a StashDB network that links none itself, like
// Vixen Media Group: the one its studios' sites mostly belong to, so its
// page has the movies of all of them. A network another StashDB studio
// links is that studio's, as with Adult Time Originals, whose studios
// ThePornDB files under Adult Time itself; its movies would be all of
// Adult Time's
export const tpdbNetworkFor = async (
  studio: StashDbStudio,
  stashDb: StashDbAPI
): Promise<TpdbSiteSummary | null> => {
  const children = (studio.child_studios ?? []).slice(0, NETWORK_STUDIOS);

  if (!TpdbAPI.isConfigured() || children.length === 0) {
    return null;
  }

  const tpdb = TpdbAPI.fromSettings();

  return cached(`link:network:${studio.id}`, async () => {
    const urls = await stashDb.studioUrls(children.map(({ id }) => id));
    const siteIds = [...urls.values()]
      .map((list) =>
        tpdbProfileIds(
          list.map((url) => ({ url, site: { name: '' } })),
          'studio'
        )
      )
      .filter((ids) => ids.length > 0)
      .slice(0, NETWORK_SITES);
    const sites = await Promise.all(
      siteIds.map((ids) => firstFound(ids, (id) => tpdb.getSite(id)))
    );
    const counts = new Map<number, number>();
    for (const site of sites) {
      const network = site?.network?.id ?? site?.network_id ?? site?.parent_id;
      if (site && network && network !== site.id) {
        counts.set(network, (counts.get(network) ?? 0) + 1);
      }
    }
    const [best] = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    const network = best ? await tpdb.getSite(best[0]) : null;

    if (!network) {
      return null;
    }

    const owner = (await linkedStashDbStudios([network], stashDb)).get(
      network.id
    );
    return !owner || owner === studio.id ? network : null;
  });
};

// The ThePornDB performer of a StashDB performer id, for its page's movies
// and the Adult Movies filters
export const linkedTpdbPerformer = async (
  id: string,
  stashDb: StashDbAPI
): Promise<TpdbLink<TpdbPerformerSummary> | null> => {
  const performer = await stashDb.getPerformer(id);
  return performer && tpdbPerformerFor(performer);
};

// The ThePornDB site of a StashDB studio id: the one it links or, for a
// network linking no site of its own, its studios' network
export const linkedTpdbSite = async (
  id: string,
  stashDb: StashDbAPI
): Promise<TpdbLink<TpdbSiteSummary> | null> => {
  const studio = await stashDb.getStudio(id);

  if (!studio) {
    return null;
  }

  const site = await tpdbSiteFor(studio);

  if (site) {
    return { match: site, via: 'stashdb' };
  }

  const network = await tpdbNetworkFor(studio, stashDb);
  return network && { match: network, via: 'network' };
};

// A studio or performer the Adult Movies list is filtered by: a StashDB id
// from the Filters panel, or ThePornDB's own from the pages' lists
export type AdultMovieRef = number | string;

export interface AdultMovieRefs {
  studio?: AdultMovieRef;
  excludeStudios?: AdultMovieRef[];
  performer?: AdultMovieRef[];
  excludePerformers?: AdultMovieRef[];
}

export interface AdultMovieIds {
  studio?: number;
  excludeStudios?: number[];
  performer?: number[];
  excludePerformers?: number[];
}

// The filters with ThePornDB's ids for the picked studio and performers,
// which its query takes. StashDB ids are translated through the links, all
// at once; ThePornDB's pass. A picked one without a ThePornDB counterpart
// leaves no movie (null), as titles need all of the picks; an excluded one
// without leaves nothing to exclude. StashDB is only asked for StashDB ids,
// so ThePornDB's work without it
export const tpdbFilterIds = async <T extends AdultMovieRefs>(
  refs: T
): Promise<(Omit<T, keyof AdultMovieIds> & AdultMovieIds) | null> => {
  const resolve = async (
    type: 'performer' | 'studio',
    ref: AdultMovieRef
  ): Promise<number | null> =>
    typeof ref === 'number'
      ? ref
      : type === 'studio'
        ? ((await linkedTpdbSite(ref, StashDbAPI.fromSettings()))?.match.id ??
          null)
        : ((await linkedTpdbPerformer(ref, StashDbAPI.fromSettings()))?.match
            ._id ?? null);
  const resolveAll = (type: 'performer' | 'studio', list?: AdultMovieRef[]) =>
    list ? Promise.all(list.map((ref) => resolve(type, ref))) : undefined;

  const [studio, excludeStudios, performer, excludePerformers] =
    await Promise.all([
      refs.studio === undefined ? undefined : resolve('studio', refs.studio),
      resolveAll('studio', refs.excludeStudios),
      resolveAll('performer', refs.performer),
      resolveAll('performer', refs.excludePerformers),
    ]);

  if (studio === null || performer?.includes(null)) {
    return null;
  }

  const found = (list?: (number | null)[]) =>
    list?.filter((id): id is number => id !== null);

  return {
    ...refs,
    studio,
    excludeStudios: found(excludeStudios),
    performer: found(performer),
    excludePerformers: found(excludePerformers),
  };
};
