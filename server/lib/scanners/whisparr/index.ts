import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import type { AdultMediaType } from '@server/constants/media';
import { adultIdField, MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import type { WhisparrSettings } from '@server/lib/settings';
import { getSettings } from '@server/lib/settings';
import { uniqWith } from 'lodash';
import { In } from 'typeorm';

type SyncStatus = StatusBase & {
  currentServer: WhisparrSettings;
  servers: WhisparrSettings[];
};

// Links scenes and adult movies to Whisparr and marks them available once
// Whisparr has their file. Only titles requested through Seerr show as
// processing: performer and studio monitoring adds many more, which stay
// requestable like a series Sonarr follows. Only monitored items are
// scanned; see WhisparrAPI.getMonitoredItems. Servers flagged 4K hold the 4K
// versions, like 4K Radarr servers do for movies.
class WhisparrScanner
  extends BaseScanner<WhisparrItem>
  implements RunnableScanner<SyncStatus>
{
  private servers: WhisparrSettings[] = [];
  private currentServer: WhisparrSettings;
  // Read once per server, so items mostly need no queries of their own
  private requestedIds = new Set<number>();
  private requested4kIds = new Set<number>();
  private adultMedia = new Map<string, Media>();

  constructor() {
    super('Whisparr Scan', { bundleSize: 50 });
  }

  public status(): SyncStatus {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
      currentServer: this.currentServer,
      servers: this.servers,
    };
  }

  public async run(): Promise<void> {
    const settings = getSettings();
    const sessionId = this.startRun();

    try {
      this.servers = uniqWith(
        settings.whisparr,
        (a, b) =>
          a.hostname === b.hostname &&
          a.port === b.port &&
          a.baseUrl === b.baseUrl
      );

      for (const server of this.servers) {
        this.currentServer = server;

        if (!server.syncEnabled) {
          this.log(
            `Sync not enabled. Skipping Whisparr server: ${server.name}`
          );
          continue;
        }

        this.log(
          `Beginning to process Whisparr server: ${server.name}`,
          'info'
        );

        const whisparr = WhisparrAPI.forServer(server);

        this.items = await whisparr.getMonitoredItems();
        await this.preload();
        await this.loop(this.processItem.bind(this), { sessionId });
      }

      this.log('Whisparr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      if (this.sessionId === sessionId) {
        this.requestedIds.clear();
        this.requested4kIds.clear();
        this.adultMedia.clear();
      }
      this.endRun(sessionId);
    }
  }

  private async preload(): Promise<void> {
    const [requested, adult] = await Promise.all([
      getRepository(Media).query(
        'SELECT DISTINCT "mediaId", "is4k" FROM media_request'
      ) as Promise<{ mediaId: number; is4k: boolean | number }[]>,
      getRepository(Media).find({
        where: { mediaType: In([MediaType.SCENE, MediaType.ADULT_MOVIE]) },
      }),
    ]);

    // SQLite returns booleans as 0 and 1
    this.requestedIds = new Set(
      requested.filter(({ is4k }) => !is4k).map(({ mediaId }) => mediaId)
    );
    this.requested4kIds = new Set(
      requested.filter(({ is4k }) => !!is4k).map(({ mediaId }) => mediaId)
    );
    this.adultMedia = new Map(
      adult.flatMap((media) => {
        const id = media[adultIdField(media.mediaType as AdultMediaType)];
        return id ? [[`${media.mediaType}:${id}`, media] as const] : [];
      })
    );
  }

  private async processItem(item: WhisparrItem): Promise<void> {
    const is4k = this.currentServer.is4k;

    try {
      if (item.itemType === 'scene' && item.stashId) {
        await this.processExternal(item, is4k, MediaType.SCENE, item.stashId);
      } else if (item.itemType === 'movie' && item.tpdbId) {
        // Only ThePornDB movies are adult movies; TMDB movies belong to Radarr
        await this.processExternal(
          item,
          is4k,
          MediaType.ADULT_MOVIE,
          item.tpdbId
        );
      }
    } catch (e) {
      this.log('Failed to process Whisparr item', 'error', {
        errorMessage: e.message,
        title: item.title,
      });
    }
  }

  // Scenes and adult movies, keyed by their stash-box or ThePornDB id
  private async processExternal(
    item: WhisparrItem,
    is4k: boolean,
    mediaType: AdultMediaType,
    externalId: string
  ) {
    const mediaRepository = getRepository(Media);
    const idField = adultIdField(mediaType);
    const key = `${mediaType}:${externalId}`;
    const statusField = is4k ? 'status4k' : 'status';
    const serviceFields = {
      [is4k ? 'serviceId4k' : 'serviceId']: this.currentServer.id,
      [is4k ? 'externalServiceId4k' : 'externalServiceId']: item.id,
      [is4k ? 'externalServiceSlug4k' : 'externalServiceSlug']: item.titleSlug,
    } as Partial<Media>;

    // The status the title should have, and whether that changes it
    const plan = (media: Media) => {
      const requested =
        !!media.id &&
        (is4k ? this.requested4kIds : this.requestedIds).has(media.id);
      const previous = media[statusField] ?? MediaStatus.UNKNOWN;
      const next = item.hasFile
        ? MediaStatus.AVAILABLE
        : !requested
          ? // Earlier scans marked every monitored title processing
            previous === MediaStatus.PROCESSING
            ? MediaStatus.UNKNOWN
            : previous
          : previous === MediaStatus.AVAILABLE ||
              previous === MediaStatus.DELETED
            ? previous
            : MediaStatus.PROCESSING;
      const changed =
        !media.id ||
        media[statusField] !== next ||
        Object.entries(serviceFields).some(
          ([field, value]) => media[field as keyof Media] !== value
        );

      return { next, changed };
    };

    const newMedia = () =>
      new Media({
        mediaType,
        [idField]: externalId,
        tmdbId: null,
      });

    await this.asyncLock.dispatch(key, async () => {
      const known = this.adultMedia.get(key);

      if (known && !plan(known).changed) {
        this.log(
          `Title already exists and no changes detected for ${item.title}`
        );
        return;
      }

      // Read again to change, as other scans may have saved it since
      const media =
        (known &&
          (await mediaRepository.findOne({ where: { id: known.id } }))) ||
        newMedia();
      const { next, changed } = plan(media);

      if (!changed) {
        return;
      }

      Object.assign(media, serviceFields);
      media[statusField] = next;

      if (next === MediaStatus.AVAILABLE && !media.mediaAddedAt) {
        media.mediaAddedAt = item.movieFile?.dateAdded
          ? new Date(item.movieFile.dateAdded)
          : new Date();
      }

      this.adultMedia.set(key, await mediaRepository.save(media));
      this.log(`Updated ${mediaType}: ${item.title}`);
    });
  }
}

export const whisparrScanner = new WhisparrScanner();
