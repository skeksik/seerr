import type { WhisparrSettings } from '@server/lib/settings';
import logger from '@server/logger';
import ServarrBase from './base';

// Whisparr v3 ("Eros") is a Radarr fork where scenes and movies share the
// movie resource. Scenes are keyed by their stash-box UUID (stashId) and
// adult movies by their ThePornDB UUID (tpdbId). Whisparr v2 (a Sonarr fork)
// is not supported.

export type WhisparrItemType = 'scene' | 'movie';

export interface WhisparrItem {
  id?: number;
  title: string;
  itemType: WhisparrItemType;
  foreignId: string;
  stashId?: string | null;
  tmdbId: number;
  // ThePornDB movie UUID; movies listed from ThePornDB have no TMDB id
  tpdbId?: string | null;
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
  searchNow?: boolean;
}

// Performers and studios Whisparr follows, keyed by their stash-box UUID
export type WhisparrCreditType = 'performer' | 'studio';

export interface WhisparrCredit {
  id: number;
  foreignId: string;
  // Their scenes, from StashDB
  monitored: boolean;
  // Their movies, from Whisparr's movie metadata source
  moviesMonitored: boolean;
  // Links StashDB lists for them; Whisparr adds their movies by the one to
  // its movie metadata source
  tmdbId?: number;
  tpdbId?: string | null;
  // Whether their new releases are added monitored, or unmonitored
  whisparrMonitorNewItems: boolean;
  qualityProfileId: number;
  rootFolderPath?: string | null;
  searchOnAdd: boolean;
  tags: number[];
}

// Where Whisparr takes movies from (Settings, General)
export type WhisparrMovieMetadataSource = 'none' | 'tmdb' | 'tpdb';

interface WhisparrCommand {
  name: string;
  status: string;
  body?: { performerIds?: number[]; studioIds?: number[] };
}

// What to monitor of a performer or studio, and the server settings their
// titles take when Whisparr first follows them
export interface WhisparrMonitorOptions {
  scenes: boolean;
  movies: boolean;
  monitorNewItems: boolean;
  searchOnAdd: boolean;
  qualityProfileId: number;
  rootFolderPath: string;
  tags: number[];
}

interface WhisparrPage {
  page: number;
  pageSize: number;
  totalRecords: number;
  records: WhisparrItem[];
}

const SCAN_PAGE_SIZE = 1000;

// The metadata source rarely changes and is read on every credit page
const METADATA_SOURCE_TTL = 300;

// A network's page reads what Whisparr monitors of each of its studios from
// the full list, a few hundred entries
const CREDIT_LIST_TTL = 60;

const refreshCommand = (type: WhisparrCreditType) =>
  type === 'performer'
    ? { name: 'RefreshPerformers', idsKey: 'performerIds' as const }
    : { name: 'RefreshStudios', idsKey: 'studioIds' as const };

// A lookup Whisparr answered without results, unlike a failed one
export class WhisparrItemNotFoundError extends Error {}

class WhisparrAPI extends ServarrBase<{ movieId: number }> {
  // How long monitoring a new performer or studio waits for Whisparr to
  // finish refreshing it before turning on its movies
  protected refreshWait = { interval: 1000, timeout: 15000 };

  constructor({ url, apiKey }: { url: string; apiKey: string }) {
    super({ url, apiKey, cacheName: 'whisparr', apiName: 'Whisparr' });
  }

  public static forServer(server: WhisparrSettings): WhisparrAPI {
    return new WhisparrAPI({
      apiKey: server.apiKey,
      url: WhisparrAPI.buildUrl(server, '/api/v3'),
    });
  }

  // Whisparr also holds every scene of the performers and studios it follows,
  // usually tens of thousands of unmonitored entries. Like the Radarr scan
  // skips unmonitored movies without a file, the scan pages through monitored
  // items alone; titles unmonitored after their download are looked up one by
  // one where Seerr tracks them.
  public async getMonitoredItems(): Promise<WhisparrItem[]> {
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
  }

  public async getItem({ id }: { id: number }): Promise<WhisparrItem> {
    try {
      const response = await this.axios.get<WhisparrItem>(`/movie/${id}`);

      return response.data;
    } catch (e) {
      throw new Error(`[Whisparr] Failed to retrieve item: ${e.message}`, {
        cause: e,
      });
    }
  }

  // Lookup results carry the library id and state when the item already exists
  public lookupScene(stashId: string): Promise<WhisparrItem> {
    return this.lookup(`stash:${stashId}`, 'scene');
  }

  public lookupTpdbMovie(tpdbId: string): Promise<WhisparrItem> {
    return this.lookup(`tpdb:${tpdbId}`, 'movie');
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
      throw new WhisparrItemNotFoundError(
        `Item not found in Whisparr: ${term}`
      );
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
          monitored: true,
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
        monitored: true,
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

  public async getCredit(
    type: WhisparrCreditType,
    foreignId: string
  ): Promise<WhisparrCredit | null> {
    try {
      const response = await this.axios.get<WhisparrCredit>(
        `/${type}/${foreignId}`
      );
      return response.data;
    } catch (e) {
      if (e?.response?.status === 404) {
        return null;
      }
      throw new Error(`[Whisparr] Failed to retrieve ${type}: ${e.message}`, {
        cause: e,
      });
    }
  }

  public async getMovieMetadataSource(): Promise<WhisparrMovieMetadataSource> {
    try {
      const config = await this.get<{ whisparrMovieMetadataSource?: string }>(
        '/config/host',
        undefined,
        METADATA_SOURCE_TTL
      );
      const source = config.whisparrMovieMetadataSource?.toLowerCase();

      return source === 'tmdb' || source === 'tpdb' ? source : 'none';
    } catch (e) {
      throw new Error(
        `[Whisparr] Failed to retrieve the movie metadata source: ${e.message}`,
        { cause: e }
      );
    }
  }

  // Whisparr takes moviesMonitored only for performers and studios StashDB
  // links to its movie metadata source, and adds their movies by that link
  public static canMonitorMovies(
    credit: Pick<WhisparrCredit, 'tmdbId' | 'tpdbId'>,
    source: WhisparrMovieMetadataSource
  ): boolean {
    switch (source) {
      case 'tmdb':
        return (credit.tmdbId ?? 0) > 0;
      case 'tpdb':
        return !!credit.tpdbId;
      default:
        return false;
    }
  }

  // Every performer or studio Whisparr follows, in one call
  public async listCredits(
    type: WhisparrCreditType
  ): Promise<WhisparrCredit[]> {
    try {
      return await this.get<WhisparrCredit[]>(
        `/${type}`,
        undefined,
        CREDIT_LIST_TTL
      );
    } catch (e) {
      throw new Error(
        `[Whisparr] Failed to retrieve the ${type} list: ${e.message}`,
        { cause: e }
      );
    }
  }

  // Sets what Whisparr monitors of a performer or studio: their scenes,
  // their movies where it can add them, and whether new releases come
  // monitored. Adds them when Whisparr does not follow them yet and anything
  // is turned on; with everything off, there is nothing to add.
  public async applyCreditMonitoring(
    type: WhisparrCreditType,
    foreignId: string,
    options: WhisparrMonitorOptions
  ): Promise<WhisparrCredit | null> {
    const existing = await this.getCredit(type, foreignId);
    const anyOn = options.scenes || options.movies;

    if (!existing && !anyOn) {
      return null;
    }

    let source: WhisparrMovieMetadataSource = 'none';

    if (options.movies) {
      try {
        source = await this.getMovieMetadataSource();
      } catch (e) {
        logger.warn(`[Whisparr] Monitoring ${type} ${foreignId} scenes only`, {
          errorMessage: e.message,
        });
      }
    }

    // The list a network's page reads would show the old state until it
    // expires
    this.removeCache(`/${type}`);

    try {
      if (!existing) {
        return await this.addCredit(type, foreignId, source, options);
      }

      const credit = await this.updateCredit(type, existing, {
        monitored: options.scenes,
        moviesMonitored:
          options.movies && WhisparrAPI.canMonitorMovies(existing, source),
        whisparrMonitorNewItems: options.monitorNewItems,
        searchOnAdd: anyOn ? options.searchOnAdd : existing.searchOnAdd,
        rootFolderPath: existing.rootFolderPath || options.rootFolderPath,
      });

      // Whisparr only syncs scenes and movies on add or on its scheduled
      // refresh
      if (anyOn) {
        await this.refreshCredit(type, existing.id);
      }

      logger.info(
        `[Whisparr] ${anyOn ? 'Monitored' : 'Unmonitored'} ${type} ${foreignId}`,
        {
          monitored: credit.monitored,
          moviesMonitored: credit.moviesMonitored,
          monitorNewItems: credit.whisparrMonitorNewItems,
        }
      );
      return credit;
    } catch (e) {
      throw new Error(`[Whisparr] Failed to update ${type}: ${e.message}`, {
        cause: e,
      });
    }
  }

  // Whisparr learns a performer's or studio's links from StashDB when it adds
  // them, so their movies are turned on after the add
  private async addCredit(
    type: WhisparrCreditType,
    foreignId: string,
    source: WhisparrMovieMetadataSource,
    options: WhisparrMonitorOptions
  ): Promise<WhisparrCredit> {
    const { data: added } = await this.axios.post<WhisparrCredit>(`/${type}`, {
      foreignId,
      monitored: options.scenes,
      moviesMonitored: false,
      whisparrMonitorNewItems: options.monitorNewItems,
      searchOnAdd: options.searchOnAdd,
      qualityProfileId: options.qualityProfileId,
      rootFolderPath: options.rootFolderPath,
      tags: options.tags,
    });
    logger.info(`[Whisparr] Added ${type} ${foreignId}`, {
      monitored: options.scenes,
    });

    if (
      !options.movies ||
      !added?.id ||
      !WhisparrAPI.canMonitorMovies(added, source)
    ) {
      return added;
    }

    // The add queues a refresh, which saves the performer or studio as it
    // read it when it started and would undo moviesMonitored set meanwhile
    await this.waitForRefresh(type, added.id);

    const current = (await this.getCredit(type, foreignId)) ?? added;
    const credit = await this.updateCredit(type, current, {
      moviesMonitored: true,
    });
    await this.refreshCredit(type, added.id);
    logger.info(`[Whisparr] Monitored the movies of ${type} ${foreignId}`);

    return credit;
  }

  private async updateCredit(
    type: WhisparrCreditType,
    credit: WhisparrCredit,
    changes: Partial<WhisparrCredit>
  ): Promise<WhisparrCredit> {
    const response = await this.axios.put<WhisparrCredit>(
      `/${type}/${credit.id}`,
      { ...credit, ...changes }
    );

    return response.data;
  }

  private refreshCredit(type: WhisparrCreditType, id: number): Promise<void> {
    const { name, idsKey } = refreshCommand(type);

    return this.runCommand(name, { [idsKey]: [id] });
  }

  // Waits, up to a limit, while Whisparr has a refresh of the performer or
  // studio queued or running
  private async waitForRefresh(
    type: WhisparrCreditType,
    id: number
  ): Promise<void> {
    const { name, idsKey } = refreshCommand(type);
    const deadline = Date.now() + this.refreshWait.timeout;

    for (;;) {
      let refreshing: boolean;

      try {
        const { data } = await this.axios.get<WhisparrCommand[]>('/command');
        refreshing = data.some(
          (command) =>
            command.name === name &&
            (command.status === 'queued' || command.status === 'started') &&
            !!command.body?.[idsKey]?.includes(id)
        );
      } catch (e) {
        logger.debug('[Whisparr] Unable to check for a running refresh', {
          errorMessage: e.message,
        });
        return;
      }

      if (!refreshing) {
        return;
      }

      if (Date.now() >= deadline) {
        logger.warn(
          `[Whisparr] ${name} of ${type} ${id} is still running; its movies may only be added on Whisparr's next refresh`
        );
        return;
      }

      await new Promise((resolve) =>
        setTimeout(resolve, this.refreshWait.interval)
      );
    }
  }

  public async removeItem(
    item: Pick<WhisparrItem, 'id' | 'title' | 'foreignId'>
  ): Promise<void> {
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
  }
}

export default WhisparrAPI;
