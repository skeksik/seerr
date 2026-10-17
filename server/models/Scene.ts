import type {
  StashDbGender,
  StashDbImage,
  StashDbPerformer,
  StashDbPerformerSummary,
  StashDbScene,
  StashDbSceneStudio,
  StashDbSceneSummary,
  StashDbStudio,
  StashDbStudioSummary,
  StashDbUrl,
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

// StashDB performer in the common search results
export interface PerformerResult {
  // StashDB id, or ThePornDB's numeric one for its own performers
  id: string;
  mediaType: 'performer';
  // The page is on ThePornDB, by its numeric id
  source?: 'tpdb';
  tpdbId?: number;
  // The image is ThePornDB's, which StashDB-linked performers also keep
  imageType?: 'tpdb';
  name: string;
  disambiguation?: string;
  imageUrl?: string;
}

export interface SceneResult {
  id: string;
  mediaType: 'scene';
  title: string;
  overview?: string;
  releaseDate?: string;
  duration?: number;
  // Landscape cover art; stash-box serves smaller sizes with ?size=300|600|1280
  imageUrl?: string;
  studio?: SceneStudio;
  performers: ScenePerformer[];
  mediaInfo?: Media;
}

export interface SceneDetails extends SceneResult {
  // Set by the details routes for the viewer
  onUserWatchlist?: boolean;
  details?: string;
  productionDate?: string;
  code?: string;
  director?: string;
  urls: SiteLink[];
  tags: { id: string; name: string }[];
  // Scene page on the configured stash-box instance
  stashDbUrl: string;
}

// Names a studio, performer or tag filter on the browse page
export interface SceneFilterDetails {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
}

// Present for request managers when a default Whisparr server is set up
export interface WhisparrMonitorStatus {
  // Their scenes
  monitored: boolean;
  // Their movies
  moviesMonitored: boolean;
  // Whether Whisparr can monitor their movies, which takes a StashDB link to
  // its movie metadata source; unknown until Whisparr follows them
  moviesAvailable?: boolean;
  serviceUrl: string;
}

export interface ScenePerformerDetails extends SceneFilterDetails {
  disambiguation?: string;
  gender?: StashDbGender;
  aliases: string[];
  birthDate?: string;
  careerStart?: number;
  careerEnd?: number;
  country?: string;
  sceneCount: number;
  urls: SiteLink[];
  stashDbUrl: string;
  whisparr?: WhisparrMonitorStatus;
}

export interface SceneStudioDetails extends SceneFilterDetails {
  aliases: string[];
  parent?: { id: string; name: string };
  // A network's studios, by name
  studios: SceneFilterDetails[];
  urls: SiteLink[];
  stashDbUrl: string;
  whisparr?: WhisparrMonitorStatus;
}

export interface SceneListResponse {
  page: number;
  totalPages: number;
  totalResults: number;
  results: SceneResult[];
}

// A profile or scene link; the icon is stash-box's favicon for the site
export interface SiteLink {
  url: string;
  site: string;
  icon?: string;
}

const mapUrls = (urls: StashDbUrl[]): SiteLink[] =>
  urls.map(({ url, site }) => ({
    url,
    site: site.name,
    icon: site.icon || undefined,
  }));

// stash-box lists images largest first, but nothing guarantees it
export const pickImage = (images: StashDbImage[]): string | undefined =>
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
  overview: scene.details || undefined,
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
  stashDbOrigin: string,
  media?: Media
): SceneDetails => ({
  ...mapSceneResult(scene, media),
  details: scene.details ?? undefined,
  productionDate: scene.production_date ?? undefined,
  code: scene.code ?? undefined,
  director: scene.director ?? undefined,
  urls: mapUrls(scene.urls),
  tags: scene.tags.map(({ id, name }) => ({ id, name })),
  stashDbUrl: `${stashDbOrigin}/scenes/${scene.id}`,
});

export const mapPerformerDetails = (
  performer: StashDbPerformer,
  stashDbOrigin: string
): ScenePerformerDetails => ({
  id: performer.id,
  name: performer.disambiguation
    ? `${performer.name} (${performer.disambiguation})`
    : performer.name,
  imageUrl: pickImage(performer.images),
  disambiguation: performer.disambiguation ?? undefined,
  gender: performer.gender ?? undefined,
  aliases: performer.aliases,
  birthDate: performer.birth_date ?? undefined,
  careerStart: performer.career_start_year ?? undefined,
  careerEnd: performer.career_end_year ?? undefined,
  country: performer.country ?? undefined,
  sceneCount: performer.scene_count,
  urls: mapUrls(performer.urls),
  stashDbUrl: `${stashDbOrigin}/performers/${performer.id}`,
});

export const mapStudioDetails = (
  studio: StashDbStudio,
  stashDbOrigin: string
): SceneStudioDetails => ({
  id: studio.id,
  name: studio.name,
  imageUrl: pickImage(studio.images),
  aliases: studio.aliases,
  parent: studio.parent ?? undefined,
  studios: (studio.child_studios ?? [])
    .map((child) => ({
      id: child.id,
      name: child.name,
      imageUrl: pickImage(child.images),
    }))
    .sort((a, b) => a.name.localeCompare(b.name)),
  urls: mapUrls(studio.urls),
  stashDbUrl: `${stashDbOrigin}/studios/${studio.id}`,
});

// Studios or networks by how many of the given scenes they have, most
// first. Networks are the top of each studio's tree that has studios under
// it; studios are those with none
export const rankStudios = (
  studios: StashDbSceneStudio[],
  type: 'studios' | 'networks'
): SceneFilterDetails[] => {
  const networkIds = new Set(
    studios.flatMap((studio) =>
      [studio.parent?.id, studio.parent?.parent?.id].filter(
        (id): id is string => !!id
      )
    )
  );
  const counts = new Map<
    string,
    { studio: SceneFilterDetails; count: number }
  >();

  for (const studio of studios) {
    const entry =
      type === 'networks'
        ? (studio.parent?.parent ??
          studio.parent ??
          (networkIds.has(studio.id) ? studio : undefined))
        : networkIds.has(studio.id)
          ? undefined
          : studio;
    if (!entry) {
      continue;
    }
    const current = counts.get(entry.id);
    counts.set(entry.id, {
      studio: current?.studio ?? {
        id: entry.id,
        name: entry.name,
        imageUrl: pickImage(entry.images),
      },
      count: (current?.count ?? 0) + 1,
    });
  }

  // Map keeps first-seen order, so ties stay in scene order
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map(({ studio }) => studio);
};
