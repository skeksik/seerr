import ExternalAPI from '@server/api/externalapi';
import type {
  TpdbMovie,
  TpdbMovieSort,
  TpdbPage,
  TpdbPerformerExtras,
  TpdbPerformerSummary,
  TpdbSiteSummary,
  TpdbTag,
} from '@server/api/tpdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

// Details rarely change once a movie is listed; lists move with new releases.
const DETAILS_TTL = 21600;
const LIST_TTL = 3600;

export class TpdbNotConfiguredError extends Error {
  constructor() {
    super('ThePornDB is not configured');
    this.name = 'TpdbNotConfiguredError';
  }
}

export const DEFAULT_URL = 'https://api.theporndb.net';

const STASHDB_PERFORMER =
  /^https:\/\/stashdb\.org\/performers\/([0-9a-f-]{36})\/?$/i;

// Performers link their StashDB profile; there is no lookup by StashDB id
export const stashDbPerformerId = (
  extras?: TpdbPerformerExtras | null
): string | undefined =>
  extras?.links?.StashDB?.match(STASHDB_PERFORMER)?.[1]?.toLowerCase();

export interface TpdbMovieQuery {
  page?: number;
  perPage?: number;
  query?: string;
  sort?: TpdbMovieSort;
  siteId?: number;
  // A movie must feature every one of them, unless anyPerformer is set
  performerIds?: number[];
  anyPerformer?: boolean;
  // Likewise every tag, unless anyTag is set
  tagIds?: number[];
  anyTag?: boolean;
  year?: number;
  // ThePornDB takes a single date bound per query
  date?: { value: string; operation: '>' | '>=' | '<' | '<=' | '=' };
}

class TpdbAPI extends ExternalAPI {
  constructor({ url, apiKey }: { url?: string; apiKey: string }) {
    super(
      (url || DEFAULT_URL).replace(/\/+$/, ''),
      {},
      {
        headers: { Authorization: `Bearer ${apiKey}` },
        nodeCache: cacheManager.getCache('tpdb').data,
        rateLimit: { maxRequests: 2, maxRPS: 2 },
        timeout: 15000,
      }
    );
  }

  public static isConfigured(): boolean {
    return !!getSettings().tpdb.apiKey;
  }

  public static fromSettings(): TpdbAPI {
    const { url, apiKey } = getSettings().tpdb;

    if (!apiKey) {
      throw new TpdbNotConfiguredError();
    }

    return new TpdbAPI({ url, apiKey });
  }

  // Cheapest authenticated call, used to validate keys
  public async test(): Promise<void> {
    await this.get('/sites', { params: { per_page: 1 } }, 0);
  }

  public async getMovies({
    page = 1,
    perPage = 20,
    query,
    sort,
    siteId,
    performerIds,
    anyPerformer = false,
    tagIds,
    anyTag = false,
    year,
    date,
  }: TpdbMovieQuery = {}): Promise<TpdbPage<TpdbMovie>> {
    return this.get<TpdbPage<TpdbMovie>>(
      '/movies',
      {
        params: {
          page,
          per_page: perPage,
          q: query,
          orderBy: sort ?? (query ? 'most_relevant' : 'recently_released'),
          site_id: siteId,
          // Networks and parent sites take in the movies of their sites
          site_operation: siteId ? 'Site/Parent/Network' : undefined,
          // Keyed by id like tags; the name is ignored
          ...Object.fromEntries(
            (performerIds ?? []).map((id) => [`performers[${id}]`, id])
          ),
          performer_and:
            !anyPerformer && (performerIds ?? []).length > 1 ? 1 : undefined,
          // Tags are keyed by id; the name is ignored
          ...Object.fromEntries(
            (tagIds ?? []).map((id) => [`tags[${id}]`, id])
          ),
          tag_and: !anyTag && (tagIds ?? []).length > 1 ? 1 : undefined,
          year,
          date: date?.value,
          date_operation: date?.operation,
        },
      },
      LIST_TTL
    );
  }

  public async getMovie(id: string): Promise<TpdbMovie | null> {
    try {
      const response = await this.get<{ data: TpdbMovie }>(
        `/movies/${id}`,
        undefined,
        DETAILS_TTL
      );
      return response.data;
    } catch (e) {
      if (e?.response?.status === 404) {
        return null;
      }
      throw e;
    }
  }

  // ThePornDB's own picks, unpaged
  public async getSimilarMovies(id: string): Promise<TpdbMovie[]> {
    const response = await this.get<{ data: TpdbMovie[] }>(
      `/movies/${id}/similar`,
      undefined,
      DETAILS_TTL
    );
    return response.data ?? [];
  }

  public async searchSites(query: string): Promise<TpdbSiteSummary[]> {
    const response = await this.get<TpdbPage<TpdbSiteSummary>>(
      '/sites',
      { params: { q: query, per_page: 25 } },
      DETAILS_TTL
    );
    return response.data;
  }

  public async getSite(id: number): Promise<TpdbSiteSummary | null> {
    try {
      const response = await this.get<{ data: TpdbSiteSummary }>(
        `/sites/${id}`,
        undefined,
        DETAILS_TTL
      );
      return response.data;
    } catch (e) {
      if (e?.response?.status === 404) {
        return null;
      }
      throw e;
    }
  }

  // The sites of a network
  public async getNetworkSites(id: number): Promise<TpdbSiteSummary[]> {
    const response = await this.get<TpdbPage<TpdbSiteSummary>>(
      '/sites',
      { params: { network_id: id, per_page: 100 } },
      DETAILS_TTL
    );
    return response.data.filter((site) => site.id !== id);
  }

  public async searchPerformers(
    query: string
  ): Promise<TpdbPerformerSummary[]> {
    const response = await this.get<TpdbPage<TpdbPerformerSummary>>(
      '/performers',
      { params: { q: query, per_page: 25 } },
      DETAILS_TTL
    );
    return response.data;
  }

  public async getPerformer(
    id: string | number
  ): Promise<TpdbPerformerSummary | null> {
    try {
      const response = await this.get<{ data: TpdbPerformerSummary }>(
        `/performers/${id}`,
        undefined,
        DETAILS_TTL
      );
      return response.data;
    } catch (e) {
      if (e?.response?.status === 404) {
        return null;
      }
      throw e;
    }
  }

  public async findPerformerByStashDbId(
    stashDbId: string,
    name: string
  ): Promise<TpdbPerformerSummary | null> {
    const performers = await this.searchPerformers(name);

    return (
      performers.find(
        (performer) => stashDbPerformerId(performer.extras) === stashDbId
      ) ?? null
    );
  }

  // Sites hold no StashDB links, so studios are matched on their name
  public async findSiteByName(name: string): Promise<TpdbSiteSummary | null> {
    const sites = (await this.searchSites(name)).filter(
      (site) => site.name.toLowerCase() === name.toLowerCase()
    );

    return sites.find((site) => site.name === name) ?? sites[0] ?? null;
  }

  public async searchTags(query: string): Promise<TpdbTag[]> {
    const response = await this.get<TpdbPage<TpdbTag>>(
      '/tags',
      { params: { q: query, per_page: 25 } },
      DETAILS_TTL
    );
    return response.data;
  }
}

export default TpdbAPI;
