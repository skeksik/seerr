import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI from '@server/api/servarr/whisparr';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import type { WhisparrSettings } from '@server/lib/settings';
import { XxxMovieSource, getSettings } from '@server/lib/settings';
import { uniqWith } from 'lodash';
import type { FindOptionsWhere } from 'typeorm';
import { Brackets } from 'typeorm';

type SyncStatus = StatusBase & {
  currentServer: WhisparrSettings;
  servers: WhisparrSettings[];
};

// Marks scenes and adult movies requested through Seerr as processing or
// available from Whisparr. Everything else Whisparr monitors stays out of
// Seerr, so performer and studio monitoring doesn't flood it with titles
// nobody asked for. Only monitored items are scanned; see
// WhisparrAPI.getMonitoredItems.
class WhisparrScanner
  extends BaseScanner<WhisparrItem>
  implements RunnableScanner<SyncStatus>
{
  private servers: WhisparrSettings[] = [];
  private currentServer: WhisparrSettings;

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

        const whisparr = new WhisparrAPI({
          apiKey: server.apiKey,
          url: WhisparrAPI.buildUrl(server, '/api/v3'),
        });

        this.items = await whisparr.getMonitoredItems();
        await this.loop(this.processItem.bind(this), { sessionId });
      }

      await this.pruneUnrequested();

      this.log('Whisparr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processItem(item: WhisparrItem): Promise<void> {
    const is4k = this.currentServer.is4k;

    try {
      if (item.itemType === 'scene' && item.stashId) {
        await this.processExternal(item, is4k, MediaType.SCENE, item.stashId);
      } else if (item.itemType === 'movie') {
        await this.processMovieItem(item, is4k);
      }
    } catch (e) {
      this.log('Failed to process Whisparr item', 'error', {
        errorMessage: e.message,
        title: item.title,
      });
    }
  }

  // Movies become XXX movies when they are listed from ThePornDB, unless an
  // adult TMDB movie already tracks them; otherwise they are TMDB movies
  private async processMovieItem(item: WhisparrItem, is4k: boolean) {
    const hasTmdb = item.tmdbId > 0;

    if (!item.tpdbId) {
      if (hasTmdb) {
        await this.processAdultMovie(item, is4k);
      }
      return;
    }

    const preferTpdb =
      getSettings().xxxMovies.source === XxxMovieSource.TPDB || !hasTmdb;
    const trackedByTmdb =
      hasTmdb &&
      (await getRepository(Media).exist({
        where: {
          tmdbId: item.tmdbId,
          mediaType: MediaType.MOVIE,
          isAdult: true,
        },
      }));

    if (preferTpdb && !trackedByTmdb) {
      await this.processExternal(item, is4k, MediaType.XXX_MOVIE, item.tpdbId);
    } else {
      await this.processAdultMovie(item, is4k);
    }
  }

  // Scenes and XXX movies, keyed by their stash-box or ThePornDB id
  private async processExternal(
    item: WhisparrItem,
    is4k: boolean,
    mediaType: MediaType.SCENE | MediaType.XXX_MOVIE,
    externalId: string
  ) {
    const mediaRepository = getRepository(Media);
    const idField = mediaType === MediaType.SCENE ? 'stashId' : 'tpdbId';

    await this.asyncLock.dispatch(`${mediaType}:${externalId}`, async () => {
      const media = await this.findRequested({
        [idField]: externalId,
        mediaType,
      });

      if (!media) {
        this.log(`Not requested through Seerr, skipping ${item.title}`);
        return;
      }

      const statusField = is4k ? 'status4k' : 'status';
      const previous = media[statusField] ?? MediaStatus.UNKNOWN;
      const next = item.hasFile
        ? MediaStatus.AVAILABLE
        : previous === MediaStatus.AVAILABLE || previous === MediaStatus.DELETED
          ? previous
          : MediaStatus.PROCESSING;

      const serviceFields = {
        [is4k ? 'serviceId4k' : 'serviceId']: this.currentServer.id,
        [is4k ? 'externalServiceId4k' : 'externalServiceId']: item.id,
        [is4k ? 'externalServiceSlug4k' : 'externalServiceSlug']:
          item.titleSlug,
      } as Partial<Media>;

      const changed =
        !media.id ||
        media[statusField] !== next ||
        Object.entries(serviceFields).some(
          ([key, value]) => media[key as keyof Media] !== value
        );

      if (!changed) {
        this.log(
          `Title already exists and no changes detected for ${item.title}`
        );
        return;
      }

      Object.assign(media, serviceFields);
      media[statusField] = next;

      if (next === MediaStatus.AVAILABLE && !media.mediaAddedAt) {
        media.mediaAddedAt = item.movieFile?.dateAdded
          ? new Date(item.movieFile.dateAdded)
          : new Date();
      }

      await mediaRepository.save(media);
      this.log(`Updated ${mediaType}: ${item.title}`);
    });
  }

  // The media row of a title someone requested through Seerr
  private async findRequested(
    where: FindOptionsWhere<Media>
  ): Promise<Media | null> {
    const media = await getRepository(Media).findOne({
      where,
      relations: { requests: true },
    });

    return media && (media.requests ?? []).length > 0 ? media : null;
  }

  // Earlier scans tracked everything Whisparr monitors. Rows nobody
  // requested, watchlisted, blocklisted or reported lose their Whisparr
  // status; rows with nothing else to them are removed.
  private async pruneUnrequested(): Promise<void> {
    const mediaRepository = getRepository(Media);
    const orphans = await mediaRepository
      .createQueryBuilder('media')
      .leftJoin('media.requests', 'request')
      .leftJoin('media.watchlists', 'watchlist')
      .leftJoin('media.issues', 'issue')
      .where(
        new Brackets((qb) =>
          qb
            .where('media.mediaType IN (:...adultTypes)', {
              adultTypes: [MediaType.SCENE, MediaType.XXX_MOVIE],
            })
            .orWhere('(media.mediaType = :movie AND media.isAdult = :adult)', {
              movie: MediaType.MOVIE,
              adult: true,
            })
        )
      )
      .andWhere('request.id IS NULL')
      .andWhere('watchlist.id IS NULL')
      .andWhere('issue.id IS NULL')
      .andWhere('media.status != :blocklisted', {
        blocklisted: MediaStatus.BLOCKLISTED,
      })
      .andWhere(
        '(media.serviceId IS NOT NULL OR media.serviceId4k IS NOT NULL)'
      )
      .getMany();

    for (const media of orphans) {
      // Still in a media server library: only the Whisparr link goes
      if (media.stashMediaId || media.ratingKey || media.jellyfinMediaId) {
        media.serviceId = null;
        media.serviceId4k = null;
        media.externalServiceId = null;
        media.externalServiceId4k = null;
        media.externalServiceSlug = null;
        media.externalServiceSlug4k = null;
        if (media.status === MediaStatus.PROCESSING) {
          media.status = MediaStatus.UNKNOWN;
        }
        if (media.status4k === MediaStatus.PROCESSING) {
          media.status4k = MediaStatus.UNKNOWN;
        }
        await mediaRepository.save(media);
      } else {
        await mediaRepository.remove(media);
      }
    }

    if (orphans.length > 0) {
      this.log(
        `Stopped tracking ${orphans.length} title(s) not requested through Seerr`,
        'info'
      );
    }
  }

  private async processAdultMovie(item: WhisparrItem, is4k: boolean) {
    const mediaRepository = getRepository(Media);
    const existing = await this.findRequested({
      tmdbId: item.tmdbId,
      mediaType: MediaType.MOVIE,
    });

    if (!existing) {
      this.log(`Not requested through Seerr, skipping ${item.title}`);
      return;
    }

    // Radarr already manages this movie; leave its service ids alone
    if (
      existing &&
      !existing.isAdult &&
      (existing.serviceId != null || existing.serviceId4k != null)
    ) {
      return;
    }

    await this.processMovie(item.tmdbId, {
      is4k: this.enable4kMovie && is4k,
      serviceId: this.currentServer.id,
      externalServiceId: item.id,
      externalServiceSlug: item.titleSlug,
      title: item.title,
      processing: !item.hasFile && item.monitored,
      hasFile: item.hasFile,
    });

    await mediaRepository.update(
      { tmdbId: item.tmdbId, mediaType: MediaType.MOVIE, isAdult: false },
      { isAdult: true }
    );
  }
}

export const whisparrScanner = new WhisparrScanner();
