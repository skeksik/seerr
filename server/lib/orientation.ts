import type { StashDbSceneSummary } from '@server/api/stashdb/interfaces';
import type { TpdbMovie } from '@server/api/tpdb/interfaces';
import type { User } from '@server/entity/User';

// The sexual preference filters, like the ones adult sites offer
export const ORIENTATIONS = [
  'straight',
  'lesbian',
  'bisexual',
  'gay',
  'trans',
  'futa',
] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

export const isOrientation = (value: string): value is Orientation =>
  (ORIENTATIONS as readonly string[]).includes(value);

// StashDB's Orientation tags, plus Futanari, by name since other stash-box
// instances have other ids
export const STASHDB_ORIENTATION_TAGS: Record<Orientation, string> = {
  straight: 'Straight',
  lesbian: 'Lesbian',
  bisexual: 'Bisexual',
  gay: 'Gay',
  trans: 'Transgender',
  futa: 'Futanari',
};

// Scenes are tagged when a performer is not on StashDB yet
export const STASHDB_MISSING_PERFORMER_TAGS = {
  female: 'Missing Performer (Female)',
  male: 'Missing Performer (Male)',
  trans: 'Missing Performer (Trans)',
} as const;

export type StashDbOrientationTagIds = {
  orientations: Partial<Record<Orientation, string>>;
  missing: Partial<Record<keyof typeof STASHDB_MISSING_PERFORMER_TAGS, string>>;
};

interface Cast {
  female: number;
  male: number;
  trans: number;
}

// Without orientation tags, the cast tells: any trans performer makes it
// trans, women and men straight, two or more women lesbian and men alone gay.
// A lone woman suits both straight and lesbian; no cast says nothing
const fromCast = ({ female, male, trans }: Cast): Orientation[] => {
  if (trans > 0) {
    return ['trans'];
  }
  if (female > 0 && male > 0) {
    return ['straight'];
  }
  if (female > 1) {
    return ['lesbian'];
  }
  if (female === 1) {
    return ['straight', 'lesbian'];
  }
  if (male > 0) {
    return ['gay'];
  }
  return [];
};

const castGender = (gender?: string | null): keyof Cast | undefined => {
  const value = gender?.toLowerCase() ?? '';
  if (value.includes('trans')) {
    return 'trans';
  }
  if (value === 'female') {
    return 'female';
  }
  if (value === 'male') {
    return 'male';
  }
  return undefined;
};

const countCast = (genders: (string | null | undefined)[]): Cast => {
  const cast: Cast = { female: 0, male: 0, trans: 0 };
  for (const gender of genders) {
    const key = castGender(gender);
    if (key) {
      cast[key] += 1;
    }
  }
  return cast;
};

export const classifyScene = (
  scene: StashDbSceneSummary,
  tagIds: StashDbOrientationTagIds
): Orientation[] => {
  const sceneTags = new Set(scene.tags?.map((tag) => tag.id));
  const tagged = ORIENTATIONS.filter((orientation) => {
    const id = tagIds.orientations[orientation];
    return !!id && sceneTags.has(id);
  });
  const cast = countCast(
    scene.performers.map(({ performer }) => performer.gender)
  );

  // Performers StashDB does not have yet still count, so a scene with only
  // its male performer listed is not taken for a gay one
  for (const key of ['female', 'male', 'trans'] as const) {
    const id = tagIds.missing[key];
    if (id && sceneTags.has(id)) {
      cast[key] += 1;
    }
  }

  if (tagged.length > 0) {
    // Tags are the more precise; a trans performer still makes it trans
    return cast.trans > 0 && !tagged.includes('trans')
      ? [...tagged, 'trans']
      : tagged;
  }

  return fromCast(cast);
};

// ThePornDB tags name orientations alone or as in "Twosome (Lesbian)"
const TPDB_TAG_PATTERNS: [Orientation, RegExp][] = [
  ['straight', /\(straight\)/i],
  ['lesbian', /^lesbian$|\(lesbian\)/i],
  ['bisexual', /^bisexual$|\(bisexual\)/i],
  ['gay', /^gay$|\(gay\)/i],
  ['trans', /^(trans|transgender|solo trans)$|\(trans(-\w+)?\)/i],
  ['futa', /^futanari$/i],
];

// ThePornDB's own orientation tags, for asking for them
export const TPDB_ORIENTATION_TAG_IDS: Partial<Record<Orientation, number>> = {
  lesbian: 8,
  bisexual: 213,
  gay: 1065,
  trans: 14025,
  futa: 11726,
};

export const classifyMovie = (movie: TpdbMovie): Orientation[] => {
  const tagged = TPDB_TAG_PATTERNS.flatMap(([orientation, pattern]) =>
    movie.tags?.some((tag) => pattern.test(tag.name)) ? [orientation] : []
  );
  const cast = countCast(
    (movie.performers ?? []).map(
      (performer) =>
        performer.extra?.gender ??
        performer.extras?.gender ??
        performer.parent?.extras?.gender
    )
  );

  if (tagged.length > 0) {
    return cast.trans > 0 && !tagged.includes('trans')
      ? [...tagged, 'trans']
      : tagged;
  }

  return fromCast(cast);
};

// Trans performers and futanari are features of a title rather than who it
// is for, so hiding them hides every title that has them
export const FEATURE_ORIENTATIONS: Orientation[] = ['trans', 'futa'];

// Straight titles are most of any catalogue, so without straight the shown
// ones are too few to find by filtering pages; lists then ask for titles
// tagged with a shown orientation instead
export const tagsNeeded = (hidden: Set<Orientation>): Orientation[] => {
  const shown = ORIENTATIONS.filter((orientation) => !hidden.has(orientation));
  return shown.length > 0 && !shown.includes('straight') ? shown : [];
};

// A title is left out when it has a hidden feature, or when none of its
// orientations is shown. Titles nothing is known about always show
export const isHidden = (
  orientations: Orientation[],
  hidden: Set<Orientation>
): boolean =>
  orientations.some(
    (orientation) =>
      FEATURE_ORIENTATIONS.includes(orientation) && hidden.has(orientation)
  ) ||
  (orientations.length > 0 &&
    orientations.every((orientation) => hidden.has(orientation)));

export interface OrientationPreferences {
  // Never shown to the user, set by admins
  disabled: Orientation[];
  // Shown only when picked in the filters
  unchecked: Orientation[];
}

export const orientationPreferences = (
  user?: User | null
): OrientationPreferences => ({
  disabled: (user?.settings?.disabledOrientations ?? []).filter(isOrientation),
  unchecked: (user?.settings?.uncheckedOrientations ?? []).filter(
    isOrientation
  ),
});

// The orientations a list hides: those not picked in the filters, or the
// user's unchecked ones without a pick, and always the disabled ones.
// `picked` is the filter's comma-separated list; "none" picks none
export const hiddenOrientations = (
  user: User | null | undefined,
  picked?: string
): Set<Orientation> => {
  const { disabled, unchecked } = orientationPreferences(user);
  const shown =
    picked === undefined
      ? ORIENTATIONS.filter((orientation) => !unchecked.includes(orientation))
      : picked.split(',').filter(isOrientation);

  return new Set(
    ORIENTATIONS.filter(
      (orientation) =>
        disabled.includes(orientation) || !shown.includes(orientation)
    )
  );
};
