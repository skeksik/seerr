import logger from '@server/logger';
import ServarrBase from './base';

// Whisparr v3 ("Eros") is a Radarr fork where scenes and movies share the
// movie resource. Scenes are keyed by their stash-box UUID (stashId) and
// movies by their TMDB id. Whisparr v2 (a Sonarr fork) is not supported.

export type WhisparrItemType = 'scene' | 'movie';

export interface WhisparrItem {
  id?: number;
  title: string;
  itemType: WhisparrItemType;
  foreignId: string;
  stashId?: string | null;
  tmdbId: number;
  titleSlug: string;
  year: number;
  monitored: boolean;
  hasFile: boolean;
  isAvailable: boolean;
  qualityProfileId: number;
  rootFolderPath?: string;
  folder?: string;
  path?: string;
  tags: number[];
  added?: string;
  movieFile?: {
    id: number;
    size: number;
    dateAdded: string;
    mediaInfo?: { resolution?: string };
  };
}

export interface WhisparrAddOptions {
  qualityProfileId: number;
  rootFolderPath: string;
  tags: number[];
  monitored?: boolean;
  searchNow?: boolean;
}

interface WhisparrPage {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: WhisparrItem[];
}

const SCAN_PAGE_SIZE = 1000;

class WhisparrAPI extends ServarrBase<{ movieId: number }> {
  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'whisparr', apiName: 'Whisparr' });
  }

  // Whisparr also holds every scene of the performers and studios it follows,
  // usually tens of thousands of unmonitored entries. Only monitored items can
  // belong to Seerr requests, so the scan pages through those alone.
  public getMonitoredItems = async (): Promise<WhisparrItem[]> => {
    const items: WhisparrItem[] = [];
    let page = 1;

    try {
      for (;;) {
        const response = await this.axios.post<WhisparrPage>('/movie/paged', {
          page,
          pageSize: SCAN_PAGE_SIZE,
          filters: [{ key: 'monitored', value: true }],
        });

        items.push(...response.data.records);

        if (
          response.data.records.length < SCAN_PAGE_SIZE ||
          items.length >= response.data.totalRecords
        ) {
          return items;
        }

        page++;
      }
    } catch (e) {
      throw new Error(`[Whisparr] Failed to retrieve items: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getItem = async ({ id }: { id: number }): Promise<WhisparrItem> => {
    try {
      const response = await this.axios.get<WhisparrItem>(`/movie/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(`[Whisparr] Failed to retrieve item: ${e.message}`, {
        cause: e,
      });
    }
  };

  public getLibraryItemsByStashId = async (
    stashId: string
  ): Promise<WhisparrItem[]> => {
    try {
      const response = await this.axios.get<WhisparrItem[]>('/movie', {
        params: { stashId },
      });

      return response.data;
    } catch (e) {
      throw new Error(
        `[Whisparr] Failed to retrieve items by stash ID: ${e.message}`,
        { cause: e }
      );
    }
  };

  public getLibraryItemsByTmdbId = async (
    tmdbId: number
  ): Promise<WhisparrItem[]> => {
    try {
      const response = await this.axios.get<WhisparrItem[]>('/movie', {
        params: { tmdbId },
      });

      return response.data;
    } catch (e) {
      throw new Error(
        `[Whisparr] Failed to retrieve items by TMDB ID: ${e.message}`,
        { cause: e }
      );
    }
  };

  // Lookup results carry the library id and state when the item already exists
  public lookupScene(stashId: string): Promise<WhisparrItem> {
    return this.lookup(`stash:${stashId}`, 'scene');
  }

  public lookupMovie(tmdbId: number): Promise<WhisparrItem> {
    return this.lookup(`tmdb:${tmdbId}`, 'movie');
  }

  private async lookup(
    term: string,
    itemType: WhisparrItemType
  ): Promise<WhisparrItem> {
    let items: WhisparrItem[];

    try {
      const response = await this.axios.get<WhisparrItem[]>('/movie/lookup', {
        params: { term, itemType },
      });
      items = response.data;
    } catch (e) {
      logger.error('Error looking up item in Whisparr', {
        label: 'Whisparr API',
        errorMessage: e.message,
        term,
      });
      throw e;
    }

    if (!items[0]) {
      throw new Error(`Item not found in Whisparr: ${term}`);
    }

    return items[0];
  }

  public async addItem(
    item: WhisparrItem,
    options: WhisparrAddOptions
  ): Promise<WhisparrItem> {
    try {
      if (item.id && item.hasFile) {
        logger.info('Item already exists in Whisparr with a file', {
          label: 'Whisparr',
          itemId: item.id,
          title: item.title,
        });
        return item;
      }

      if (item.id && item.monitored) {
        logger.info('Item is already monitored in Whisparr', {
          label: 'Whisparr',
          itemId: item.id,
          title: item.title,
        });

        if (options.searchNow && item.isAvailable) {
          this.searchItem(item.id);
        }

        return item;
      }

      if (item.id) {
        // Followed performers and studios add their scenes unmonitored
        const response = await this.axios.put<WhisparrItem>('/movie', {
          ...item,
          qualityProfileId: options.qualityProfileId,
          rootFolderPath: options.rootFolderPath,
          tags: Array.from(new Set([...item.tags, ...options.tags])),
          monitored: options.monitored ?? true,
        });

        logger.info('Found existing item in Whisparr and set it to monitored', {
          label: 'Whisparr',
          itemId: response.data.id,
          title: response.data.title,
        });

        if (
          options.searchNow &&
          response.data.isAvailable &&
          response.data.id
        ) {
          this.searchItem(response.data.id);
        }

        return response.data;
      }

      const response = await this.axios.post<WhisparrItem>('/movie', {
        ...item,
        qualityProfileId: options.qualityProfileId,
        rootFolderPath: options.rootFolderPath,
        tags: options.tags,
        monitored: options.monitored ?? true,
        addOptions: {
          searchForMovie: options.searchNow,
          monitor: 'movieOnly',
          addMethod: 'manual',
        },
      });

      if (!response.data.id) {
        throw new Error('Whisparr did not return the added item');
      }

      logger.info('Whisparr accepted request', {
        label: 'Whisparr',
        itemId: response.data.id,
        title: response.data.title,
      });

      return response.data;
    } catch (e) {
      logger.error('Failed to add item to Whisparr', {
        label: 'Whisparr',
        errorMessage: e.message,
        foreignId: item.foreignId,
        response: e?.response?.data,
      });
      throw new Error('Failed to add item to Whisparr', { cause: e });
    }
  }

  public async searchItem(itemId: number): Promise<void> {
    logger.info('Executing Whisparr search command', {
      label: 'Whisparr API',
      itemId,
    });

    try {
      await this.runCommand('MoviesSearch', { movieIds: [itemId] });
    } catch (e) {
      logger.error('Something went wrong while executing Whisparr search.', {
        label: 'Whisparr API',
        errorMessage: e.message,
        itemId,
      });
    }
  }

  public removeItem = async (item: WhisparrItem): Promise<void> => {
    if (!item.id) {
      logger.info('[Whisparr] Item not in library, nothing to remove', {
        foreignId: item.foreignId,
      });
      return;
    }

    try {
      await this.axios.delete(`/movie/${item.id}`, {
        params: { deleteFiles: true, addImportExclusion: false },
      });
      logger.info(`[Whisparr] Removed ${item.title}`);
    } catch (e) {
      if (e?.response?.status === 404) {
        logger.info('[Whisparr] Item already removed', {
          foreignId: item.foreignId,
        });
        return;
      }
      throw e;
    }
  };
}

export default WhisparrAPI;
