import type {
  StashDbGender,
  StashDbImage,
  StashDbPerformerSummary,
  StashDbScene,
  StashDbSceneSummary,
  StashDbStudioSummary,
} from '@server/api/stashdb/interfaces';
import type Media from '@server/entity/Media';

export interface SceneStudio {
  id: string;
  name: string;
  parent?: { id: string; name: string };
}

export interface ScenePerformer {
  id: string;
  name: string;
  disambiguation?: string;
  // Name the performer is credited as in this scene, when it differs
  as?: string;
  gender?: StashDbGender;
  imageUrl?: string;
}

export interface SceneResult {
  id: string;
  mediaType: 'scene';
  title: string;
  releaseDate?: string;
  duration?: number;
  // Landscape cover art; stash-box serves smaller sizes with ?size=300|600|1280
  imageUrl?: string;
  studio?: SceneStudio;
  performers: ScenePerformer[];
  mediaInfo?: Media;
}

export interface SceneDetails extends SceneResult {
  details?: string;
  productionDate?: string;
  code?: string;
  director?: string;
  urls: { url: string; site: string }[];
  tags: { id: string; name: string }[];
}

export interface SceneListResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SceneResult[];
}

// stash-box lists images largest first, but nothing guarantees it
const pickImage = (images: StashDbImage[]): string | undefined =>
  [...images].sort((a, b) => b.width - a.width)[0]?.url;

const mapStudio = (
  studio?: StashDbStudioSummary | null
): SceneStudio | undefined =>
  studio
    ? {
        id: studio.id,
        name: studio.name,
        parent: studio.parent ?? undefined,
      }
    : undefined;

const mapPerformer = (
  performer: StashDbPerformerSummary,
  as?: string | null
): ScenePerformer => ({
  id: performer.id,
  name: performer.name,
  disambiguation: performer.disambiguation ?? undefined,
  as: as && as !== performer.name ? as : undefined,
  gender: performer.gender ?? undefined,
  imageUrl: performer.images[0]?.url,
});

export const mapSceneResult = (
  scene: StashDbSceneSummary,
  media?: Media
): SceneResult => ({
  id: scene.id,
  mediaType: 'scene',
  title: scene.title ?? '',
  releaseDate: scene.release_date ?? undefined,
  duration: scene.duration ?? undefined,
  imageUrl: pickImage(scene.images),
  studio: mapStudio(scene.studio),
  performers: scene.performers.map(({ performer, as }) =>
    mapPerformer(performer, as)
  ),
  mediaInfo: media,
});

export const mapSceneDetails = (
  scene: StashDbScene,
  media?: Media
): SceneDetails => ({
  ...mapSceneResult(scene, media),
  details: scene.details ?? undefined,
  productionDate: scene.production_date ?? undefined,
  code: scene.code ?? undefined,
  director: scene.director ?? undefined,
  urls: scene.urls.map(({ url, site }) => ({ url, site: site.name })),
  tags: scene.tags.map(({ id, name }) => ({ id, name })),
});
