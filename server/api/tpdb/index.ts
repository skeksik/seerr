import ExternalAPI from '@server/api/externalapi';
import type {
  TpdbMovie,
  TpdbMovieSort,
  TpdbPage,
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

export interface TpdbMovieQuery {
  page?: number;
  perPage?: number;
  query?: string;
  sort?: TpdbMovieSort;
  siteId?: number;
  performerId?: number;
  tagIds?: number[];
  year?: number;
  // ThePornDB takes a single date bound per query
  date?: { value: string; operation: '>' | '>=' | '<' | '<=' | '=' };
}

class TpdbAPI extends ExternalAPI {
  constructor(apiKey: string) {
    super(
      'https://api.theporndb.net',
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
    const { apiKey } = getSettings().tpdb;

    if (!apiKey) {
      throw new TpdbNotConfiguredError();
    }

    return new TpdbAPI(apiKey);
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
    performerId,
    tagIds,
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
          performer_id: performerId,
          // Tags are keyed by id; the name is ignored
          ...Object.fromEntries(
            (tagIds ?? []).map((id) => [`tags[${id}]`, id])
          ),
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
