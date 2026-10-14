import ExternalAPI from '@server/api/externalapi';
import type {
  StashDbGraphqlResponse,
  StashDbPerformer,
  StashDbScene,
  StashDbSceneList,
  StashDbSceneSort,
  StashDbStudio,
  StashDbTag,
  StashDbVersion,
} from '@server/api/stashdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

const IMAGE_FIELDS = 'id url width height';

const SCENE_SUMMARY_FIELDS = `
  id
  title
  release_date
  duration
  images { ${IMAGE_FIELDS} }
  studio { id name parent { id name } }
  performers {
    as
    performer { id name disambiguation gender images { ${IMAGE_FIELDS} } }
  }
`;

const SCENE_FIELDS = `
  ${SCENE_SUMMARY_FIELDS}
  details
  production_date
  code
  director
  deleted
  urls { url site { name } }
  tags { id name description }
`;

const SCENE_LIST_FIELDS = `count scenes { ${SCENE_SUMMARY_FIELDS} }`;

// Details rarely change once a scene is approved; lists move with new releases.
const DETAILS_TTL = 21600;
const LIST_TTL = 3600;

export class StashDbNotConfiguredError extends Error {
  constructor() {
    super('StashDB is not configured');
    this.name = 'StashDbNotConfiguredError';
  }
}

export interface StashDbSceneQuery {
  page?: number;
  perPage?: number;
  sort?: StashDbSceneSort;
  direction?: 'ASC' | 'DESC';
  studioId?: string;
  performerId?: string;
  tagId?: string;
}

class StashDbAPI extends ExternalAPI {
  constructor({ endpoint, apiKey }: { endpoint: string; apiKey: string }) {
    super(
      endpoint,
      {},
      {
        headers: { ApiKey: apiKey },
        nodeCache: cacheManager.getCache('stashdb').data,
        // Matches the request budget Stash itself uses for stash-box
        rateLimit: { maxRequests: 4, maxRPS: 4 },
        timeout: 15000,
      }
    );
  }

  public static fromSettings(): StashDbAPI {
    const { endpoint, apiKey } = getSettings().stashdb;

    if (!endpoint || !apiKey) {
      throw new StashDbNotConfiguredError();
    }

    return new StashDbAPI({ endpoint, apiKey });
  }

  private async query<T>(
    query: string,
    variables: Record<string, unknown> = {},
    ttl?: number
  ): Promise<T> {
    const body = { query, variables };
    const response = await this.post<StashDbGraphqlResponse<T>>(
      '',
      body,
      undefined,
      ttl
    );

    if (response.errors?.length || !response.data) {
      // post() caches before we can inspect the body
      this.removeCache('', { data: body });
      throw new Error(
        `[StashDB] ${response.errors?.map((e) => e.message).join(', ') ?? 'Empty response'}`
      );
    }

    return response.data;
  }

  public async getVersion(): Promise<StashDbVersion> {
    const data = await this.query<{ version: StashDbVersion }>(
      'query { version { version } }',
      {},
      0
    );

    return data.version;
  }

  public async getScene(id: string): Promise<StashDbScene | null> {
    const data = await this.query<{ findScene: StashDbScene | null }>(
      `query ($id: ID!) { findScene(id: $id) { ${SCENE_FIELDS} } }`,
      { id },
      DETAILS_TTL
    );

    return data.findScene;
  }

  public async searchScenes({
    query,
    page = 1,
    perPage = 20,
  }: {
    query: string;
    page?: number;
    perPage?: number;
  }): Promise<StashDbSceneList> {
    const data = await this.query<{ searchScenes: StashDbSceneList }>(
      `query ($term: String!, $page: Int!, $perPage: Int!) {
        searchScenes(term: $term, page: $page, per_page: $perPage) { ${SCENE_LIST_FIELDS} }
      }`,
      { term: query, page, perPage },
      LIST_TTL
    );

    return data.searchScenes;
  }

  public async queryScenes({
    page = 1,
    perPage = 20,
    sort = 'TRENDING',
    direction = 'DESC',
    studioId,
    performerId,
    tagId,
  }: StashDbSceneQuery = {}): Promise<StashDbSceneList> {
    const includes = (id?: string) =>
      id ? { value: [id], modifier: 'INCLUDES' } : undefined;

    const data = await this.query<{ queryScenes: StashDbSceneList }>(
      `query ($input: SceneQueryInput!) { queryScenes(input: $input) { ${SCENE_LIST_FIELDS} } }`,
      {
        input: {
          page,
          per_page: perPage,
          sort,
          direction,
          studios: includes(studioId),
          performers: includes(performerId),
          tags: includes(tagId),
        },
      },
      LIST_TTL
    );

    return data.queryScenes;
  }

  public async getPerformer(id: string): Promise<StashDbPerformer | null> {
    const data = await this.query<{ findPerformer: StashDbPerformer | null }>(
      `query ($id: ID!) {
        findPerformer(id: $id) {
          id name disambiguation gender aliases birth_date country scene_count
          images { ${IMAGE_FIELDS} }
          urls { url site { name } }
        }
      }`,
      { id },
      DETAILS_TTL
    );

    return data.findPerformer;
  }

  public async getStudio(id: string): Promise<StashDbStudio | null> {
    const data = await this.query<{ findStudio: StashDbStudio | null }>(
      `query ($id: ID!) {
        findStudio(id: $id) {
          id name aliases
          parent { id name }
          images { ${IMAGE_FIELDS} }
          urls { url site { name } }
        }
      }`,
      { id },
      DETAILS_TTL
    );

    return data.findStudio;
  }

  public async getTag(id: string): Promise<StashDbTag | null> {
    const data = await this.query<{ findTag: StashDbTag | null }>(
      'query ($id: ID!) { findTag(id: $id) { id name description } }',
      { id },
      DETAILS_TTL
    );

    return data.findTag;
  }
}

export default StashDbAPI;
