import ExternalAPI from '@server/api/externalapi';
import type {
  StashDbGraphqlResponse,
  StashDbImage,
  StashDbPerformer,
  StashDbPerformerSummary,
  StashDbScene,
  StashDbSceneList,
  StashDbSceneSort,
  StashDbSceneStudio,
  StashDbSceneSummary,
  StashDbSite,
  StashDbStudio,
  StashDbStudioSummary,
  StashDbTag,
  StashDbVersion,
} from '@server/api/stashdb/interfaces';
import cacheManager from '@server/lib/cache';
import { getSettings } from '@server/lib/settings';

// pickImage only reads the url and width
const IMAGE_FIELDS = 'url width';

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
  tags { id }
`;

const SCENE_FIELDS = `
  ${SCENE_SUMMARY_FIELDS}
  production_date
  code
  director
  deleted
  urls { url site { name icon } }
  tags { id name }
`;

const SCENE_LIST_FIELDS = `count scenes { ${SCENE_SUMMARY_FIELDS} }`;

// Details rarely change once a scene is approved; lists move with new releases.
const DETAILS_TTL = 21600;
const LIST_TTL = 3600;
// Scenes read to rank studios by; one request takes a few seconds
const RANKED_SCENES = 5000;

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
  // stash-box takes a single date bound
  date?: { value: string; modifier: 'GREATER_THAN' | 'LESS_THAN' };
  // Left out, as far as stash-box allows; see sceneInput
  exclude?: {
    studioIds?: string[];
    performerIds?: string[];
    tagIds?: string[];
  };
  // For queries known to be slow, in place of the client's 15s
  timeout?: number;
}

// Each criterion takes the studios under a studio, so their children are
// looked up for the included studios, or the excluded ones when none are
// included; see sceneInput
const studioLookups = ({ studioIds, exclude }: StashDbSceneQuery): string[] =>
  studioIds?.length ? studioIds : (exclude?.studioIds ?? []);

export interface StashDbLookup {
  id: string;
  name: string;
  disambiguation?: string | null;
  imageUrl?: string;
}

// One client per endpoint and key, so the rate limit holds across requests
let shared: { key: string; api: StashDbAPI } | undefined;

class StashDbAPI extends ExternalAPI {
  // Requests on their way, so callers asking the same at once share one
  private pending = new Map<string, Promise<unknown>>();

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

    const key = `${endpoint}|${apiKey}`;
    if (shared?.key !== key) {
      shared = { key, api: new StashDbAPI({ endpoint, apiKey }) };
    }
    return shared.api;
  }

  private query<T>(
    query: string,
    variables: Record<string, unknown> = {},
    ttl?: number,
    timeout?: number
  ): Promise<T> {
    const key = JSON.stringify({ query, variables });
    const pending = this.pending.get(key);
    if (pending) {
      return pending as Promise<T>;
    }

    const request = this.send<T>(query, variables, ttl, timeout).finally(() =>
      this.pending.delete(key)
    );
    this.pending.set(key, request);
    return request;
  }

  private async send<T>(
    query: string,
    variables: Record<string, unknown>,
    ttl?: number,
    timeout?: number
  ): Promise<T> {
    const body = { query, variables };
    const response = await this.post<StashDbGraphqlResponse<T>>(
      '',
      body,
      timeout ? { timeout } : undefined,
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

  public async queryScenes(
    query: StashDbSceneQuery = {}
  ): Promise<StashDbSceneList> {
    const data = await this.query<{ queryScenes: StashDbSceneList }>(
      `query ($input: SceneQueryInput!) { queryScenes(input: $input) { ${SCENE_LIST_FIELDS} } }`,
      {
        input: this.sceneInput(
          query,
          await this.childStudios(studioLookups(query))
        ),
      },
      LIST_TTL,
      query.timeout
    );

    return data.queryScenes;
  }

  // How many scenes each query finds, in one request
  public async countScenes(queries: StashDbSceneQuery[]): Promise<number[]> {
    if (queries.length === 0) {
      return [];
    }

    // The studios of every query are looked up together
    const children = await this.childStudios([
      ...new Set(queries.flatMap(studioLookups)),
    ]);
    // Trending counts only the scenes trending now, so the count goes by
    // date, which counts them all
    const inputs = queries.map((query) =>
      this.sceneInput({ ...query, sort: 'DATE', perPage: 1 }, children)
    );
    const data = await this.query<Record<string, { count: number }>>(
      `query (${inputs.map((_, i) => `$c${i}: SceneQueryInput!`).join(', ')}) {
        ${inputs.map((_, i) => `c${i}: queryScenes(input: $c${i}) { count }`).join('\n')}
      }`,
      Object.fromEntries(inputs.map((input, i) => [`c${i}`, input])),
      LIST_TTL
    );

    return inputs.map((_, i) => data[`c${i}`]?.count ?? 0);
  }

  // stash-box takes one criterion per field, so an exclusion only goes along
  // when nothing is included on that field; callers filter out the rest.
  // Studios take in the studios under them, from childStudios
  private sceneInput(
    {
      page = 1,
      perPage = 20,
      sort = 'TRENDING',
      direction = 'DESC',
      studioIds,
      performerIds,
      tagIds,
      date,
      any,
      exclude,
    }: StashDbSceneQuery,
    children: Map<string, string[]>
  ): Record<string, unknown> {
    const withChildren = (ids?: string[]) =>
      ids?.length
        ? [...new Set([...ids, ...ids.flatMap((id) => children.get(id) ?? [])])]
        : undefined;
    const criterion = (
      include: string[] | undefined,
      excluded: string[] | undefined,
      modifier: 'INCLUDES' | 'INCLUDES_ALL'
    ) =>
      include?.length
        ? { value: include, modifier }
        : excluded?.length
          ? { value: excluded, modifier: 'EXCLUDES' }
          : undefined;

    return {
      page,
      per_page: perPage,
      sort,
      direction,
      studios: criterion(
        withChildren(studioIds),
        withChildren(exclude?.studioIds),
        'INCLUDES'
      ),
      performers: criterion(
        performerIds,
        exclude?.performerIds,
        any?.performers ? 'INCLUDES' : 'INCLUDES_ALL'
      ),
      tags: criterion(
        tagIds,
        exclude?.tagIds,
        any?.tags ? 'INCLUDES' : 'INCLUDES_ALL'
      ),
      date,
    };
  }

  // The scenes matching each set of file fingerprints, in one request
  public async findScenesByFingerprints(
    sets: { hash: string; algorithm: 'OSHASH' | 'PHASH' | 'MD5' }[][]
  ): Promise<StashDbSceneSummary[][]> {
    const queried = sets.filter((set) => set.length > 0);

    if (queried.length === 0) {
      return sets.map(() => []);
    }

    const data = await this.query<{
      findScenesBySceneFingerprints: StashDbSceneSummary[][];
    }>(
      `query ($fingerprints: [[FingerprintQueryInput!]!]!) {
        findScenesBySceneFingerprints(fingerprints: $fingerprints) {
          ${SCENE_SUMMARY_FIELDS}
        }
      }`,
      { fingerprints: queried },
      DETAILS_TTL
    );
    const found = data.findScenesBySceneFingerprints;
    let next = 0;

    return sets.map((set) => (set.length ? (found[next++] ?? []) : []));
  }

  // The scene with each studio page, in one request
  public async findScenesByUrls(
    urls: string[]
  ): Promise<(StashDbSceneSummary | undefined)[]> {
    if (urls.length === 0) {
      return [];
    }

    const data = await this.query<
      Record<string, { scenes: StashDbSceneSummary[] }>
    >(
      `query (${urls.map((_, i) => `$u${i}: String!`).join(', ')}) {
        ${urls
          .map(
            (_, i) =>
              `u${i}: queryScenes(input: { url: $u${i}, per_page: 1 }) { scenes { ${SCENE_SUMMARY_FIELDS} } }`
          )
          .join('\n')}
      }`,
      Object.fromEntries(urls.map((url, i) => [`u${i}`, url])),
      DETAILS_TTL
    );

    return urls.map((_, i) => data[`u${i}`]?.scenes[0]);
  }

  // Tag ids by name or alias; names StashDB does not know are left out
  public async getTagIds(names: string[]): Promise<Record<string, string>> {
    const data = await this.query<Record<string, { id: string } | null>>(
      `query (${names.map((_, i) => `$t${i}: String!`).join(', ')}) {
        ${names.map((_, i) => `t${i}: findTagOrAlias(name: $t${i}) { id }`).join('\n')}
      }`,
      Object.fromEntries(names.map((name, i) => [`t${i}`, name])),
      DETAILS_TTL
    );

    return Object.fromEntries(
      names.flatMap((name, i) => {
        const id = data[`t${i}`]?.id;
        return id ? [[name, id]] : [];
      })
    );
  }

  // Networks hold no scenes of their own, so a studio filter also takes in
  // the studios under it
  public async withChildStudios(ids: string[]): Promise<string[]> {
    const children = await this.childStudios(ids);

    return [
      ...new Set([...ids, ...ids.flatMap((id) => children.get(id) ?? [])]),
    ];
  }

  // The studios under each studio, in one request
  private async childStudios(ids: string[]): Promise<Map<string, string[]>> {
    if (ids.length === 0) {
      return new Map();
    }

    const data = await this.query<
      Record<string, { child_studios: { id: string }[] } | null>
    >(
      `query (${ids.map((_, i) => `$s${i}: ID!`).join(', ')}) {
        ${ids.map((_, i) => `s${i}: findStudio(id: $s${i}) { child_studios { id } }`).join('\n')}
      }`,
      Object.fromEntries(ids.map((id, i) => [`s${i}`, id])),
      DETAILS_TTL
    );

    return new Map(
      ids.map((id, i) => [
        id,
        data[`s${i}`]?.child_studios.map((child) => child.id) ?? [],
      ])
    );
  }

  public async getPerformer(id: string): Promise<StashDbPerformer | null> {
    const data = await this.query<{ findPerformer: StashDbPerformer | null }>(
      `query ($id: ID!) {
        findPerformer(id: $id) {
          id name disambiguation gender aliases birth_date country scene_count
          career_start_year career_end_year
          images { ${IMAGE_FIELDS} }
          urls { url site { name icon } }
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
          urls { url site { name icon } }
          child_studios { id name images { ${IMAGE_FIELDS} } }
        }
      }`,
      { id },
      DETAILS_TTL
    );

    return data.findStudio;
  }

  // All studios, or the top-level ones, by name or newest first
  public async queryStudios({
    page = 1,
    perPage = 40,
    sort = 'NAME',
    name,
    topLevel = false,
  }: {
    page?: number;
    perPage?: number;
    sort?: 'NAME' | 'CREATED_AT';
    name?: string;
    topLevel?: boolean;
  }): Promise<{
    count: number;
    studios: (StashDbStudioSummary & {
      images: StashDbImage[];
      child_studios: { id: string }[];
    })[];
  }> {
    const data = await this.query<{
      queryStudios: {
        count: number;
        studios: (StashDbStudioSummary & {
          images: StashDbImage[];
          child_studios: { id: string }[];
        })[];
      };
    }>(
      `query ($input: StudioQueryInput!) {
        queryStudios(input: $input) {
          count
          studios { id name images { ${IMAGE_FIELDS} } child_studios { id } }
        }
      }`,
      {
        input: {
          page,
          per_page: perPage,
          sort,
          direction: sort === 'NAME' ? 'ASC' : 'DESC',
          name: name || undefined,
          has_parent: topLevel ? false : undefined,
        },
      },
      LIST_TTL
    );

    return data.queryStudios;
  }

  // The studios of the most trending or popular scenes, one per scene, for
  // ranking studios; stash-box cannot sort studios on either. The Studios
  // and Networks rows ask for the same ranking at once, and share it
  public async getSceneStudios(
    sort: 'TRENDING' | 'POPULARITY'
  ): Promise<StashDbSceneStudio[]> {
    const studio = `id name images { ${IMAGE_FIELDS} }`;
    const data = await this.query<{
      queryScenes: { scenes: { studio?: StashDbSceneStudio | null }[] };
    }>(
      `query ($input: SceneQueryInput!) {
        queryScenes(input: $input) {
          scenes { studio { ${studio} parent { ${studio} parent { ${studio} } } } }
        }
      }`,
      {
        input: {
          sort,
          direction: 'DESC',
          per_page: RANKED_SCENES,
        },
      },
      LIST_TTL,
      60000
    );

    return data.queryScenes.scenes.flatMap(({ studio }) =>
      studio ? [studio] : []
    );
  }

  // The sites links can belong to, with their favicons
  public async getSites(): Promise<StashDbSite[]> {
    const data = await this.query<{ querySites: { sites: StashDbSite[] } }>(
      'query { querySites { sites { name url icon } } }',
      {},
      DETAILS_TTL
    );

    return data.querySites.sites;
  }

  // The studio with exactly this name, like ThePornDB's findSiteByName
  public async findStudioByName(name: string): Promise<StashDbLookup | null> {
    const studios = (await this.searchStudios(name)).filter(
      (studio) => studio.name.toLowerCase() === name.toLowerCase()
    );

    return studios.find((studio) => studio.name === name) ?? studios[0] ?? null;
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

  // Tags whose name contains the text, like "some (" for group tags
  public async queryTags(
    name: string,
    perPage = 100
  ): Promise<{ id: string; name: string }[]> {
    const data = await this.query<{
      queryTags: { tags: { id: string; name: string }[] };
    }>(
      'query ($input: TagQueryInput!) { queryTags(input: $input) { tags { id name } } }',
      { input: { name, per_page: perPage } },
      DETAILS_TTL
    );

    return data.queryTags.tags;
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
