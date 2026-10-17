import type { StashScene } from '@server/api/stash';
import StashAPI, { normalizeEndpoint } from '@server/api/stash';
import { MediaStatus, MediaType } from '@server/constants/media';
import { getRepository } from '@server/datasource';
import Media from '@server/entity/Media';
import type {
  RunnableScanner,
  StatusBase,
} from '@server/lib/scanners/baseScanner';
import BaseScanner from '@server/lib/scanners/baseScanner';
import { getSettings } from '@server/lib/settings';

// Stash plays the part Jellyfin plays for movies: it marks every scene it
// has matched to the configured stash-box as available, whoever added it,
// and links it to its Stash page for playback. Scenes Stash has not
// identified yet match on the StashDB id Whisparr puts in their folder name.

// Whisparr names scene folders "... [<StashDB id>]"
const PATH_STASH_ID =
  /\[([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\]/i;

const stashIdFromPath = (scene: StashScene): string | undefined =>
  (scene.files ?? [])
    .map((file) => file.path.match(PATH_STASH_ID)?.[1]?.toLowerCase())
    .find(Boolean);
class StashScanner
  extends BaseScanner<StashScene>
  implements RunnableScanner<StatusBase>
{
  private endpoint = '';
  // Scene rows by StashDB id, read once a run
  private existing = new Map<string, Media>();

  constructor() {
    // Each scene only looks up rows read up front, so bundles need no pause
    super('Stash Scan', { bundleSize: 50, updateRate: 100 });
  }

  public status(): StatusBase {
    return {
      running: this.running,
      progress: this.progress,
      total: this.items.length,
    };
  }

  public async run(): Promise<void> {
    if (!StashAPI.isConfigured()) {
      this.log('Stash is not configured, skipping scan', 'debug');
      return;
    }

    const sessionId = this.startRun();

    try {
      this.endpoint = normalizeEndpoint(getSettings().stashdb.endpoint);
      const stash = StashAPI.fromSettings();
      const [linked, unnamed, scenes] = await Promise.all([
        stash.getLinkedScenes(),
        stash.getUnidentifiedScenes(),
        getRepository(Media).find({ where: { mediaType: MediaType.SCENE } }),
      ]);
      const unidentified = unnamed.filter((scene) => stashIdFromPath(scene));
      this.existing = new Map(
        scenes.flatMap((media) =>
          media.stashId ? [[media.stashId, media] as const] : []
        )
      );
      this.items = [...linked, ...unidentified];
      this.log(
        `Found ${linked.length} scene(s) linked to a stash-box and ${unidentified.length} named after one`,
        'info'
      );

      await this.loop(this.processScene.bind(this), { sessionId });
      this.log('Stash scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      if (this.sessionId === sessionId) {
        this.existing.clear();
      }
      this.endRun(sessionId);
    }
  }

  private async processScene(scene: StashScene): Promise<void> {
    const stashId =
      scene.stash_ids.find(
        (id) => normalizeEndpoint(id.endpoint) === this.endpoint
      )?.stash_id ??
      (scene.stash_ids.length === 0 ? stashIdFromPath(scene) : undefined);

    if (!stashId) {
      return;
    }

    const mediaRepository = getRepository(Media);

    try {
      await this.asyncLock.dispatch(stashId, async () => {
        const known = this.existing.get(stashId);

        if (
          known?.status === MediaStatus.AVAILABLE &&
          known.stashMediaId === scene.id
        ) {
          this.log(
            `Title already exists and no changes detected for ${scene.title}`
          );
          return;
        }

        // Read again to change, as other scans may have saved it since
        const media =
          (known &&
            (await mediaRepository.findOne({ where: { id: known.id } }))) ||
          new Media({ mediaType: MediaType.SCENE, stashId, tmdbId: null });

        // Dated like Jellyfin dates movies: anew when it becomes available,
        // otherwise only when nothing dated it yet
        if (media.status !== MediaStatus.AVAILABLE || !media.mediaAddedAt) {
          media.mediaAddedAt = new Date(scene.created_at);
        }

        media.stashMediaId = scene.id;
        media.status = MediaStatus.AVAILABLE;

        this.existing.set(stashId, await mediaRepository.save(media));
        this.log(`Scene available in Stash: ${scene.title || stashId}`);
      });
    } catch (e) {
      this.log('Failed to process Stash scene', 'error', {
        errorMessage: e.message,
        sceneId: scene.id,
      });
    }
  }
}

export const stashScanner = new StashScanner();
