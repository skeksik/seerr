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
  // Titles without orientation tags or a known cast
  'unidentified',
] as const;

export type Orientation = (typeof ORIENTATIONS)[number];

export const isOrientation = (value: string): value is Orientation =>
  (ORIENTATIONS as readonly string[]).includes(value);

// StashDB's Orientation tags, plus Futanari, by name since other stash-box
// instances have other ids
export const STASHDB_ORIENTATION_TAGS: Partial<Record<Orientation, string>> = {
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
  // Group tags like "Threesome (BGG)" or "Orgy (Lesbian)", by id
  groups?: Record<string, TagHint>;
};

interface Cast {
  female: number;
  male: number;
  trans: number;
}

// What a tag's name says about a title: who is in it, as in "Threesome
// (BGG)" (B for boys, G for girls, T for trans), or whom it is for, as in
// "Foursome (Lesbian)"
export interface TagHint {
  cast?: Cast;
  orientation?: Orientation;
}

export const tagHint = (name: string): TagHint | undefined => {
  const group = name.match(/\(([BGT]{2,})\)\s*$/);
  if (group) {
    const letters = group[1];
    const count = (letter: string) => letters.split(letter).length - 1;
    return {
      cast: { male: count('B'), female: count('G'), trans: count('T') },
    };
  }
  const audience = name.match(/\((Lesbian|Gay|Straight|Trans|Mixed)\)\s*$/i);
  if (audience) {
    const value = audience[1].toLowerCase();
    return {
      orientation:
        value === 'mixed'
          ? 'straight'
          : (value as 'lesbian' | 'gay' | 'straight' | 'trans'),
    };
  }
  return undefined;
};

// Without orientation tags, the cast tells: any trans performer makes it
// trans, women and men straight, two or more women lesbian and men alone gay.
// A lone woman suits both straight and lesbian; with no cast the title is
// unidentified
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
  return ['unidentified'];
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

// Tags and cast together: group tags fill in performers the cast lacks, a
// trans performer adds trans, and men next to women add straight, so a
// lesbian-tagged scene with a man in it suits both
const classify = (
  tagged: Orientation[],
  listed: Cast,
  hints: TagHint[]
): Orientation[] => {
  const cast = { ...listed };
  const fromTags = new Set(tagged);

  for (const hint of hints) {
    if (hint.cast) {
      cast.female = Math.max(cast.female, hint.cast.female);
      cast.male = Math.max(cast.male, hint.cast.male);
      cast.trans = Math.max(cast.trans, hint.cast.trans);
    }
    if (hint.orientation) {
      fromTags.add(hint.orientation);
    }
  }

  if (fromTags.size === 0) {
    return fromCast(cast);
  }
  if (cast.trans > 0) {
    fromTags.add('trans');
  }
  if (cast.female > 0 && cast.male > 0 && !fromTags.has('bisexual')) {
    fromTags.add('straight');
  }
  return ORIENTATIONS.filter((orientation) => fromTags.has(orientation));
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

  return classify(
    tagged,
    cast,
    [...sceneTags].flatMap((id) => tagIds.groups?.[id] ?? [])
  );
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

  return classify(
    tagged,
    cast,
    (movie.tags ?? []).flatMap((tag) => tagHint(tag.name) ?? [])
  );
};

// Trans performers and futanari are features of a title rather than who it
// is for, so hiding them hides every title that has them
export const FEATURE_ORIENTATIONS: Orientation[] = ['trans', 'futa'];

// Straight titles are most of any catalogue, so without straight the shown
// ones are too few to find by filtering pages; lists then ask for titles
// tagged with a shown orientation instead
// Unidentified titles have no tag to ask for, so they are left to filtering
export const tagsNeeded = (hidden: Set<Orientation>): Orientation[] => {
  const shown = ORIENTATIONS.filter(
    (orientation) => orientation !== 'unidentified' && !hidden.has(orientation)
  );
  return shown.length > 0 && !shown.includes('straight') ? shown : [];
};

// A title is left out when it has a hidden feature, or when none of its
// orientations is shown
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
// user's unchecked ones without a pick, and always the disabled ones. A pick
// that leaves nothing shown counts as no pick
export const hiddenOrientations = (
  user: User | null | undefined,
  picked?: string
): Set<Orientation> => {
  const { disabled, unchecked } = orientationPreferences(user);
  const allowed = (values: Orientation[]) =>
    values.filter((orientation) => !disabled.includes(orientation));
  const pick = allowed(picked?.split(',').filter(isOrientation) ?? []);
  const shown = pick.length
    ? pick
    : ORIENTATIONS.filter((orientation) => !unchecked.includes(orientation));

  return new Set(
    ORIENTATIONS.filter(
      (orientation) =>
        disabled.includes(orientation) || !shown.includes(orientation)
    )
  );
};
