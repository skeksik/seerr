import ExternalAPI from '@server/api/externalapi';
import { getSettings } from '@server/lib/settings';

// Minimal client for the Stash GraphQL API (https://github.com/stashapp/stash).
// Stash has a single API key and no per-user accounts, so it only serves as a
// library that marks scenes available and provides play links.

export interface StashStashId {
  endpoint: string;
  stash_id: string;
}

export interface StashScene {
  id: string;
  title?: string | null;
  created_at: string;
  stash_ids: StashStashId[];
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: { message: string }[];
}

const PAGE_SIZE = 1000;

const SCENE_FIELDS = 'id title created_at stash_ids { endpoint stash_id }';

// Stash stores the endpoint as typed by the user; compare loosely
export const normalizeEndpoint = (endpoint: string): string =>
  endpoint.trim().replace(/\/+$/, '').toLowerCase();

export class StashNotConfiguredError extends Error {
  constructor() {
    super('Stash is not configured');
    this.name = 'StashNotConfiguredError';
  }
}

class StashAPI extends ExternalAPI {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super(
      `${url.replace(/\/+$/, '')}/graphql`,
      {},
      { headers: { ApiKey: apiKey }, timeout: 30000 }
    );
  }

  public static isConfigured(): boolean {
    const { url, apiKey } = getSettings().stash;
    return !!url && !!apiKey;
  }

  public static fromSettings(): StashAPI {
    if (!StashAPI.isConfigured()) {
      throw new StashNotConfiguredError();
    }

    return new StashAPI(getSettings().stash);
  }

  private async query<T>(
    query: string,
    variables: Record<string, unknown> = {}
  ): Promise<T> {
    // Library state changes constantly, so never cache
    const response = await this.post<GraphqlResponse<T>>(
      '',
      { query, variables },
      undefined,
      0
    );

    if (response.errors?.length || !response.data) {
      throw new Error(
        `[Stash] ${response.errors?.map((e) => e.message).join(', ') ?? 'Empty response'}`
      );
    }

    return response.data;
  }

  public async getVersion(): Promise<string> {
    const data = await this.query<{ version: { version: string } }>(
      'query { version { version } }'
    );

    return data.version.version;
  }

  // Every scene linked to any stash-box; callers pick the endpoint they use
  public async getLinkedScenes(): Promise<StashScene[]> {
    const scenes: StashScene[] = [];

    for (let page = 1; ; page++) {
      const data = await this.query<{
        findScenes: { count: number; scenes: StashScene[] };
      }>(
        `query ($page: Int!, $perPage: Int!) {
          findScenes(
            scene_filter: { stash_id_endpoint: { modifier: NOT_NULL } }
            filter: { page: $page, per_page: $perPage, sort: "id", direction: ASC }
          ) { count scenes { ${SCENE_FIELDS} } }
        }`,
        { page, perPage: PAGE_SIZE }
      );

      scenes.push(...data.findScenes.scenes);

      if (
        data.findScenes.scenes.length < PAGE_SIZE ||
        scenes.length >= data.findScenes.count
      ) {
        return scenes;
      }
    }
  }

  public async getScene(id: string): Promise<StashScene | null> {
    const data = await this.query<{ findScene: StashScene | null }>(
      `query ($id: ID!) { findScene(id: $id) { ${SCENE_FIELDS} } }`,
      { id }
    );

    return data.findScene;
  }
}

export default StashAPI;
