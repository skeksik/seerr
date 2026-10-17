import type { WhisparrItem } from '@server/api/servarr/whisparr';
import WhisparrAPI, {
  WhisparrItemNotFoundError,
} from '@server/api/servarr/whisparr';
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
import { findWhisparrItem } from '@server/lib/whisparrMedia';
import { uniqWith } from 'lodash';
import { In } from 'typeorm';

// The scene or adult movie a Whisparr item is
const itemTitle = (
  item: WhisparrItem
): { mediaType: AdultMediaType; externalId: string } | undefined =>
  item.itemType === 'scene' && item.stashId
    ? { mediaType: MediaType.SCENE, externalId: item.stashId }
    : item.itemType === 'movie' && item.tpdbId
      ? { mediaType: MediaType.ADULT_MOVIE, externalId: item.tpdbId }
      : undefined;

type SyncStatus = StatusBase & {
  currentServer: WhisparrSettings;
  servers: WhisparrSettings[];
};

// Tracks scenes and adult movies in Whisparr the way the Radarr scan tracks
// movies, whoever added them: monitored titles without a file are
// processing, titles with a file available. Only monitored items are listed;
// see WhisparrAPI.getMonitoredItems. Servers flagged 4K hold the 4K versions,
// like 4K Radarr servers do for movies.
//
// Like the Radarr scan, titles still processing that Whisparr removed, or
// that went unmonitored without a file, are reset and their approved
// requests declined once every server of their tier was scanned; see
// cleanupOrphanedMedia. Available titles are left to the availability sync.
class WhisparrScanner
  extends BaseScanner<WhisparrItem>
  implements RunnableScanner<SyncStatus>
{
  private servers: WhisparrSettings[] = [];
  private currentServer: WhisparrSettings;
  // Read once per server, so items mostly need no queries of their own
  private adultMedia = new Map<string, Media>();
  // Titles each tier's servers monitor, keyed like adultMedia
  private scannedKeys = new Set<string>();
  private scanned4kKeys = new Set<string>();
  private didScanStandard = false;
  private didScan4k = false;
  private serverReturnedEmpty = false;
  private server4kReturnedEmpty = false;

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
    this.scannedKeys.clear();
    this.scanned4kKeys.clear();
    this.didScanStandard = false;
    this.didScan4k = false;
    this.serverReturnedEmpty = false;
    this.server4kReturnedEmpty = false;

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

        if (server.is4k) {
          this.didScan4k = true;
        } else {
          this.didScanStandard = true;
        }

        if (this.items.length === 0) {
          if (server.is4k) {
            this.server4kReturnedEmpty = true;
          } else {
            this.serverReturnedEmpty = true;
          }
          this.log(
            `Whisparr server ${server.name} returned no monitored items. Orphan cleanup for this profile type will be skipped.`,
            'warn'
          );
        }

        await this.preload();
        await this.loop(this.processItem.bind(this), { sessionId });
      }

      // As with Radarr: titles on a server that was not scanned cannot be
      // told apart from orphans
      if (
        !this.servers.filter((s) => !s.is4k).every((s) => s.syncEnabled) ||
        this.serverReturnedEmpty
      ) {
        this.didScanStandard = false;
      }
      if (
        !this.servers.filter((s) => s.is4k).every((s) => s.syncEnabled) ||
        this.server4kReturnedEmpty
      ) {
        this.didScan4k = false;
      }

      await this.cleanupOrphanedMedia(false);
      await this.cleanupOrphanedMedia(true);
      this.log('Whisparr scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      if (this.sessionId === sessionId) {
        this.adultMedia.clear();
      }
      this.endRun(sessionId);
    }
  }

  private async preload(): Promise<void> {
    const adult = await getRepository(Media).find({
      where: { mediaType: In([MediaType.SCENE, MediaType.ADULT_MOVIE]) },
    });

    this.adultMedia = new Map(
      adult.flatMap((media) => {
        const id = media[adultIdField(media.mediaType as AdultMediaType)];
        return id ? [[`${media.mediaType}:${id}`, media] as const] : [];
      })
    );
  }

  private async processItem(item: WhisparrItem): Promise<void> {
    const is4k = this.currentServer.is4k;
    const title = itemTitle(item);

    if (!title) {
      // Only ThePornDB movies are adult movies; TMDB movies belong to Radarr
      return;
    }

    (is4k ? this.scanned4kKeys : this.scannedKeys).add(
      `${title.mediaType}:${title.externalId}`
    );

    try {
      await this.processExternal(
        item,
        this.currentServer,
        title.mediaType,
        title.externalId
      );
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
    server: WhisparrSettings,
    mediaType: AdultMediaType,
    externalId: string
  ) {
    const is4k = server.is4k;
    const mediaRepository = getRepository(Media);
    const idField = adultIdField(mediaType);
    const key = `${mediaType}:${externalId}`;
    const statusField = is4k ? 'status4k' : 'status';
    const serviceFields = {
      [is4k ? 'serviceId4k' : 'serviceId']: server.id,
      [is4k ? 'externalServiceId4k' : 'externalServiceId']: item.id,
      [is4k ? 'externalServiceSlug4k' : 'externalServiceSlug']: item.titleSlug,
    } as Partial<Media>;

    // The status the title should have, as BaseScanner.processMovie decides
    // it for Radarr movies, and whether that changes it. Titles turning
    // available are dated for Recently Added by their Whisparr file, the way
    // Jellyfin dates movies, since adult movies have no media server to do it
    const plan = (media: Media) => {
      const previous = media[statusField] ?? MediaStatus.UNKNOWN;
      const next =
        previous === MediaStatus.AVAILABLE
          ? previous
          : item.hasFile
            ? MediaStatus.AVAILABLE
            : item.monitored && previous !== MediaStatus.DELETED
              ? MediaStatus.PROCESSING
              : previous;
      const dated = item.hasFile && (previous !== next || !media.mediaAddedAt);
      const changed =
        !media.id ||
        previous !== next ||
        dated ||
        Object.entries(serviceFields).some(
          ([field, value]) => media[field as keyof Media] !== value
        );

      return { next, dated, changed };
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
      const { next, dated, changed } = plan(media);

      // Like Radarr's, unmonitored titles without a file are not added
      if (!changed || (!media.id && !item.monitored && !item.hasFile)) {
        return;
      }

      if (dated) {
        media.mediaAddedAt = item.movieFile?.dateAdded
          ? new Date(item.movieFile.dateAdded)
          : new Date();
      }

      Object.assign(media, serviceFields);
      media[statusField] = next;

      this.adultMedia.set(key, await mediaRepository.save(media));
      this.log(`Updated ${mediaType}: ${item.title}`);
    });
  }

  // The library item of a title on one server: by its known id, or else by
  // looking the title up. Null when the server does not have it; other
  // errors are thrown
  private async libraryItem(
    server: WhisparrSettings,
    media: Media,
    is4k: boolean
  ): Promise<WhisparrItem | null> {
    const linked = media[is4k ? 'serviceId4k' : 'serviceId'] === server.id;

    try {
      const item = await findWhisparrItem(
        WhisparrAPI.forServer(server),
        media,
        linked
          ? media[is4k ? 'externalServiceId4k' : 'externalServiceId']
          : null
      );
      return item.id ? item : null;
    } catch (e) {
      if (e instanceof WhisparrItemNotFoundError) {
        return null;
      }
      throw e;
    }
  }

  // Titles still processing that no scanned server monitors: gone from
  // Whisparr, or unmonitored there with nothing downloaded. Mirrors
  // RadarrScanner.cleanupOrphanedMovies and its status resets, but asks
  // Whisparr about each one, as unmonitored items are not scanned
  private async cleanupOrphanedMedia(is4k: boolean): Promise<void> {
    if (!(is4k ? this.didScan4k : this.didScanStandard)) {
      if (!is4k || this.servers.some((server) => server.is4k)) {
        this.log(
          `Skipping orphaned ${is4k ? '4K ' : ''}scene and adult movie cleanup: not every ${
            is4k ? '4K ' : ''
          }Whisparr server was scanned.`,
          'info'
        );
      }
      return;
    }

    const mediaRepository = getRepository(Media);
    const statusField = is4k ? 'status4k' : 'status';
    const scanned = is4k ? this.scanned4kKeys : this.scannedKeys;
    const servers = this.servers.filter((server) => server.is4k === is4k);
    const processing = await mediaRepository.find({
      where: {
        mediaType: In([MediaType.SCENE, MediaType.ADULT_MOVIE]),
        [statusField]: MediaStatus.PROCESSING,
      },
      relations: { requests: true },
    });

    for (const media of processing) {
      const externalId = media[adultIdField(media.mediaType as AdultMediaType)];

      if (!externalId || scanned.has(`${media.mediaType}:${externalId}`)) {
        continue;
      }

      let abandoned = false;
      let settled = false;

      for (const server of servers) {
        let item: WhisparrItem | null;

        try {
          item = await this.libraryItem(server, media, is4k);
        } catch (e) {
          this.log(
            `Could not confirm ${media.mediaType} ${externalId} against Whisparr server ${server.name}. Skipping cleanup for it.`,
            'warn',
            { errorMessage: e.message }
          );
          settled = true;
          break;
        }

        if (!item) {
          continue;
        }

        if (item.hasFile) {
          // Downloaded, then unmonitored
          await this.processExternal(
            item,
            server,
            media.mediaType as AdultMediaType,
            externalId
          );
          settled = true;
          break;
        }

        if (item.monitored) {
          settled = true;
          break;
        }

        abandoned = true;
      }

      if (settled) {
        continue;
      }

      media[statusField] = MediaStatus.UNKNOWN;
      await mediaRepository.save(media);
      await this.declineOrphanedRequests(
        media,
        is4k,
        abandoned
          ? 'reset to UNKNOWN after the Whisparr entry went unmonitored with nothing downloaded'
          : `not found in any ${is4k ? '4K ' : ''}Whisparr server`
      );
      this.log(
        abandoned
          ? `${media.mediaType} ${externalId} is unmonitored in Whisparr with nothing downloaded. ${is4k ? '4K status' : 'Status'} reset to UNKNOWN.`
          : `${media.mediaType} ${externalId} not found in any ${is4k ? '4K ' : ''}Whisparr server. ${is4k ? '4K status' : 'Status'} reset to UNKNOWN.`,
        'info'
      );
    }
  }
}

export const whisparrScanner = new WhisparrScanner();
