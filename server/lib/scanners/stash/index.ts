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

// Marks scenes that Stash has matched to the configured stash-box as
// available and links them to their Stash page. Scenes without a stash id
// (not yet identified in Stash) cannot be matched and are ignored.
class StashScanner
  extends BaseScanner<StashScene>
  implements RunnableScanner<StatusBase>
{
  private endpoint = '';

  constructor() {
    super('Stash Scan', { bundleSize: 50 });
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
      this.items = await StashAPI.fromSettings().getLinkedScenes();
      this.log(
        `Found ${this.items.length} scene(s) linked to a stash-box`,
        'info'
      );

      await this.loop(this.processScene.bind(this), { sessionId });
      this.log('Stash scan complete', 'info');
    } catch (e) {
      this.log('Scan interrupted', 'error', { errorMessage: e.message });
    } finally {
      this.endRun(sessionId);
    }
  }

  private async processScene(scene: StashScene): Promise<void> {
    const stashId = scene.stash_ids.find(
      (id) => normalizeEndpoint(id.endpoint) === this.endpoint
    )?.stash_id;

    if (!stashId) {
      return;
    }

    const mediaRepository = getRepository(Media);

    try {
      await this.asyncLock.dispatch(stashId, async () => {
        const media =
          (await mediaRepository.findOne({
            where: { stashId, mediaType: MediaType.SCENE },
          })) ??
          new Media({ mediaType: MediaType.SCENE, stashId, tmdbId: null });

        const changed =
          !media.id ||
          media.status !== MediaStatus.AVAILABLE ||
          media.stashMediaId !== scene.id;

        if (!changed) {
          this.log(
            `Title already exists and no changes detected for ${scene.title}`
          );
          return;
        }

        media.stashMediaId = scene.id;
        media.status = MediaStatus.AVAILABLE;
        media.mediaAddedAt ??= new Date(scene.created_at);

        await mediaRepository.save(media);
        this.log(`Scene available in Stash: ${scene.title ?? stashId}`);
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
