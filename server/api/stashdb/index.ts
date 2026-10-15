import ExternalAPI from '@server/api/externalapi';
import type {
  StashDbGraphqlResponse,
  StashDbPerformer,
  StashDbPerformerSummary,
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
  details
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
  // Any of these studios
  studioIds?: string[];
  // All of these performers and tags, unless `any` says otherwise
  performerIds?: string[];
  tagIds?: string[];
  any?: { performers?: boolean; tags?: boolean };
  // Also return each scene's tag ids, for ranking by shared tags
  withTags?: boolean;
  // stash-box takes a single date bound
  date?: { value: string; modifier: 'GREATER_THAN' | 'LESS_THAN' };
}

export interface StashDbLookup {
  id: string;
  name: string;
  disambiguation?: string | null;
  imageUrl?: string;
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
    studioIds,
    performerIds,
    tagIds,
    date,
    any,
    withTags = false,
  }: StashDbSceneQuery = {}): Promise<StashDbSceneList> {
    const criterion = (
      ids: string[] | undefined,
      modifier: 'INCLUDES' | 'INCLUDES_ALL'
    ) => (ids?.length ? { value: ids, modifier } : undefined);

    const fields = withTags
      ? `count scenes { ${SCENE_SUMMARY_FIELDS} tags { id } }`
      : SCENE_LIST_FIELDS;
    const data = await this.query<{ queryScenes: StashDbSceneList }>(
      `query ($input: SceneQueryInput!) { queryScenes(input: $input) { ${fields} } }`,
      {
        input: {
          page,
          per_page: perPage,
          sort,
          direction,
          studios: criterion(
            studioIds?.length
              ? await this.withChildStudios(studioIds)
              : undefined,
            'INCLUDES'
          ),
          performers: criterion(
            performerIds,
            any?.performers ? 'INCLUDES' : 'INCLUDES_ALL'
          ),
          tags: criterion(tagIds, any?.tags ? 'INCLUDES' : 'INCLUDES_ALL'),
          date,
        },
      },
      LIST_TTL
    );

    return data.queryScenes;
  }

  // Networks hold no scenes of their own, so a studio filter also takes in
  // the studios under it
  private async withChildStudios(ids: string[]): Promise<string[]> {
    const data = await this.query<
      Record<string, { child_studios: { id: string }[] } | null>
    >(
      `query (${ids.map((_, i) => `$s${i}: ID!`).join(', ')}) {
        ${ids.map((_, i) => `s${i}: findStudio(id: $s${i}) { child_studios { id } }`).join('\n')}
      }`,
      Object.fromEntries(ids.map((id, i) => [`s${i}`, id])),
      DETAILS_TTL
    );

    return [
      ...new Set([
        ...ids,
        ...Object.values(data).flatMap(
          (studio) => studio?.child_studios.map((child) => child.id) ?? []
        ),
      ]),
    ];
  }

  public async getPerformer(id: string): Promise<StashDbPerformer | null> {
    const data = await this.query<{ findPerformer: StashDbPerformer | null }>(
      `query ($id: ID!) {
        findPerformer(id: $id) {
          id name disambiguation gender aliases birth_date country scene_count
          career_start_year career_end_year
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

  // Studios behind the trending scenes, most frequent first
  public async getTrendingStudios(): Promise<
    {
      id: string;
      name: string;
      imageUrl?: string;
      parent?: { id: string; name: string; imageUrl?: string };
    }[]
  > {
    type StudioRef = { id: string; name: string; images: { url: string }[] };
    const data = await this.query<{
      queryScenes: {
        scenes: { studio?: (StudioRef & { parent?: StudioRef }) | null }[];
      };
    }>(
      `query {
        queryScenes(input: { sort: TRENDING, direction: DESC, per_page: 100 }) {
          scenes {
            studio { id name images { url } parent { id name images { url } } }
          }
        }
      }`,
      {},
      LIST_TTL
    );

    return data.queryScenes.scenes.flatMap(({ studio }) =>
      studio
        ? [
            {
              id: studio.id,
              name: studio.name,
              imageUrl: studio.images[0]?.url,
              parent: studio.parent
                ? {
                    id: studio.parent.id,
                    name: studio.parent.name,
                    imageUrl: studio.parent.images[0]?.url,
                  }
                : undefined,
            },
          ]
        : []
    );
  }

  public async searchStudios(term: string): Promise<StashDbLookup[]> {
    const data = await this.query<{
      searchStudio: { id: string; name: string; parent?: { name: string } }[];
    }>(
      'query ($term: String!) { searchStudio(term: $term, limit: 25) { id name parent { name } } }',
      { term },
      LIST_TTL
    );

    return data.searchStudio.map((studio) => ({
      id: studio.id,
      name: studio.name,
      disambiguation: studio.parent?.name,
    }));
  }

  public async searchPerformers(term: string): Promise<StashDbLookup[]> {
    const data = await this.query<{
      searchPerformers: {
        performers: (StashDbPerformerSummary & { disambiguation?: string })[];
      };
    }>(
      `query ($term: String!) {
        searchPerformers(term: $term, per_page: 25) {
          performers { id name disambiguation gender images { ${IMAGE_FIELDS} } }
        }
      }`,
      { term },
      LIST_TTL
    );

    return data.searchPerformers.performers.map((performer) => ({
      id: performer.id,
      name: performer.name,
      disambiguation: performer.disambiguation,
      imageUrl: performer.images[0]?.url,
    }));
  }

  public async searchTags(term: string): Promise<StashDbLookup[]> {
    const data = await this.query<{
      searchTag: { id: string; name: string }[];
    }>(
      'query ($term: String!) { searchTag(term: $term, limit: 25) { id name } }',
      { term },
      LIST_TTL
    );

    return data.searchTag;
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
