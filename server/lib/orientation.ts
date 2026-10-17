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
// (BGG)" (B for boys, G for girls, T for trans) or "Rimming - F On M", or
// whom it is for, as in "Foursome (Lesbian)"
interface TagHint {
  cast?: Cast;
  orientation?: Orientation;
  // Who body and act tags imply, like "Big Tits" or "Strap-On" a woman and
  // "Big Dick" or "Blowjob" a man. Trans and futanari performers have
  // either, so these only count without either in the title
  implied?: Cast;
  // Tags naming trans performers, which say nothing of the cast's count
  trans?: true;
}

const castOf = (female: number, male: number, trans = 0): Cast => ({
  male,
  female,
  trans,
});

// Not "Transparent" or "Transformation"
const TRANS_WORDS =
  /trans(?!parent|port|formation|lucent|fer)|shemale|t-?girl|ladyboy|futa/i;
// Tags for an audience, not about the cast
const AUDIENCE_WORDS = /\b(for|with) women\b|\bfemale (directed|friendly)\b/i;
const FEMALE_WORDS =
  /\b(woman|women|girl|girls|lady|ladies|female|milf|wife|housewife|hotwife|girlfriend|cougar|actress|waitress|stewardess|masseuse|dominatrix|mistress|schoolgirl|nun|bride|bridesmaid|femdom|femsub|lezdom|(step ?)?(sister|mom|mother|daughter|aunt|niece|grandmother|granddaughter)|vaginal|pussy|cunnilingus)\b|\(female\)/i;
const MALE_WORDS =
  /\b(man|men|guy|guys|boy|boys|male|husband|boyfriend|dilf|maledom|malesub|twink|stud|cuckold(ing)?|(step ?)?(brother|dad|daddy|father|son|uncle|grandpa|nephew))\b|\(male\)/i;
const BREAST_WORDS = /\b(tits?|titties|titty|boobs?|breasts?)\b/i;
const PENIS_WORDS =
  /\b(dicks?|cocks?|penis|penises|balls|bbc|bwc|(un)?circumcised)\b/i;
// Acts that need a woman: a strap-on is worn by one, a titjob needs her
// breasts, and squirting, tribbing and a clit are hers
const FEMALE_ACTS =
  /\b(strap-?ons?|pegg(ing|ed)|titjobs?|tit ?fuck(s|ing)?|(?<!(male|anal) )squirt(s|ing)?|tribbing|tribadism|scissoring|clit|labia|queef(ing)?|lactation|breast milk|pregnant)\b/i;
// A squirting dildo is a toy
const NOT_FEMALE_ACTS = /\b(dildos?|toys?)\b/i;
// Acts that need a man, like "Blowjob", "Facial" or "Cum in Mouth"
const MALE_ACTS =
  /\b((blow|hand|foot|tit|titty|thigh|butt|armpit|hair|shoe|sock|glove|boot|panty|calf|leg) ?jobs?|blowbangs?|deep ?throat(ing)?|cum ?shots?|cum|creampies?|facials?|bukkake|pearl necklace|money shot|(face|throat|titty|tit) ?fuck(s|ing)?|spit ?roast|ball (sucking|licking|play|worship|kicking|stretching|tie|bondage|slap\w*)|tea ?bagging|glory ?holes?|pull out|precum|(?<!reverse )pegg(ing|ed)|finishing the job)\b/i;
// Toys and fakes, like "Dildo Blowjob", "Fake Cum" or "No Cumshot", leave
// the man out, a squirting facial is hers, a lone "to cum" is anyone's
// orgasm, and instructions and humiliation are often for the viewer alone
const NOT_MALE_ACTS =
  /\b(strap-?ons?|dildos?|toys?|vibrators?|machines?|fake|implied|simulated|no|squirt(s|ing)?|to cum|facial hair|ben wa balls|instructions?|countdown|humiliation|encouragement)\b/i;
// Gender pairs, as in "Rimming - F On M", "Male Fucks Male", "Girl-Girl
// Doggy Style" or "Older Woman / Younger Woman", or letters, as in
// "Kissing - FF"
const PAIR =
  /(?:^|[\s(])([MFT]|male|female|boy|girl|guy|man|woman) (?:on|fucks) ([MFT]|male|female|boy|girl|guy|man|woman)\b|\b(boy|girl)-(boy|girl)\b|\b(man|woman) \/ \w+ (man|woman)\b/i;
const PAIR_LETTERS = /\s-\s([MFT]{2,})$/;

const pairGender = (word: string): keyof Cast => {
  const value = word.toLowerCase();
  if (value === 't') {
    return 'trans';
  }
  return ['f', 'female', 'girl', 'woman'].includes(value) ? 'female' : 'male';
};

const pairCast = (name: string): Cast | undefined => {
  const letters = name.match(PAIR_LETTERS)?.[1];
  const pair = name.match(PAIR);
  const words = letters
    ? letters.split('')
    : (pair?.slice(1).filter((word): word is string => !!word) ?? []);
  if (!words.length) {
    return undefined;
  }
  const cast = castOf(0, 0);
  for (const word of words) {
    cast[pairGender(word)] += 1;
  }
  return cast;
};

export const tagHint = (name: string): TagHint | undefined => {
  const group = name.match(/\(([BGT]{2,})\)\s*$/);
  if (group) {
    const letters = group[1];
    const count = (letter: string) => letters.split(letter).length - 1;
    return { cast: castOf(count('G'), count('B'), count('T')) };
  }
  // Point of view tags stand for the performer behind the camera, who is
  // rarely listed: a woman for "Female - POV" and "Pussy Licking - POV", a
  // trans performer for "Trans - POV", and a man for plain "POV" and the
  // other acts
  const pov = name.match(/^(?:(.+?) - )?POV$/i);
  if (pov) {
    const subject = (pov[1] ?? '').toLowerCase();
    if (['kissing', 'rimming', 'cuckold', 'mixed'].includes(subject)) {
      return undefined;
    }
    return {
      cast:
        subject === 'female' || subject === 'pussy licking'
          ? castOf(1, 0)
          : subject === 'trans'
            ? castOf(0, 0, 1)
            : castOf(0, 1),
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
  // Pairs name everyone, trans performers too, as in "Sex Toy Play - M On F"
  const pair = pairCast(name);
  if (pair) {
    return { cast: pair };
  }
  // Tags about someone's looks or role name their gender, like "Asian
  // Woman", "Long Hair (Female)" or "Step Brother", for performers the
  // cast lists without one; trans tags are left to the cast
  if (TRANS_WORDS.test(name)) {
    return { trans: true };
  }
  if (AUDIENCE_WORDS.test(name)) {
    return undefined;
  }
  const female = FEMALE_WORDS.test(name);
  const male = MALE_WORDS.test(name);
  // Body and act tags, like "Big Tits", "Strap-On" or "Cum on Pussy", say
  // who else is there
  const impliedFemale =
    !female &&
    (BREAST_WORDS.test(name) ||
      (FEMALE_ACTS.test(name) && !NOT_FEMALE_ACTS.test(name)));
  const impliedMale =
    !male &&
    (PENIS_WORDS.test(name) || MALE_ACTS.test(name)) &&
    !NOT_MALE_ACTS.test(name);

  if (!female && !male && !impliedFemale && !impliedMale) {
    return undefined;
  }
  return {
    ...(female || male ? { cast: castOf(+female, +male) } : {}),
    ...(impliedFemale || impliedMale
      ? { implied: castOf(+impliedFemale, +impliedMale) }
      : {}),
  };
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
  const hasTrans = (hint: TagHint) =>
    hint.trans ||
    (hint.cast?.trans ?? 0) > 0 ||
    hint.orientation === 'trans' ||
    hint.orientation === 'futa';
  const impliedCounts =
    listed.trans === 0 &&
    !fromTags.has('trans') &&
    !fromTags.has('futa') &&
    !hints.some(hasTrans);

  for (const hint of hints) {
    for (const add of [hint.cast, impliedCounts ? hint.implied : undefined]) {
      if (add) {
        cast.female = Math.max(cast.female, add.female);
        cast.male = Math.max(cast.male, add.male);
        cast.trans = Math.max(cast.trans, add.trans);
      }
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
    (scene.tags ?? []).flatMap((tag) =>
      tag.name ? (tagHint(tag.name) ?? []) : (tagIds.groups?.[tag.id] ?? [])
    )
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

// A title is left out when any of its sexual preferences is hidden, alone
// or next to others, like a straight and lesbian one when lesbian is
export const isHidden = (
  orientations: Orientation[],
  hidden: Set<Orientation>
): boolean => orientations.some((orientation) => hidden.has(orientation));

interface OrientationPreferences {
  // Never shown to the user, set by admins
  disabled: Orientation[];
  // Shown only when picked in the filters
  unchecked: Orientation[];
}

const orientationPreferences = (
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

// Narrowed to the orientations needed without straight, or not
export type Narrow = 'needed' | 'none';

// The tag ids of these orientations, leaving out those the source lacks
export const orientationTagIds = <T extends string | number>(
  ids: Partial<Record<Orientation, T>>,
  orientations: Orientation[]
): T[] =>
  orientations.flatMap((orientation) => {
    const id = ids[orientation];
    return id ? [id] : [];
  });

export interface OrientationTagPlan<T> {
  hidden: Set<Orientation>;
  // The picked tags, with the orientation tags asked for when narrowed
  tagIds: T[];
  // Whether a title needs any of tagIds rather than all of them
  anyTag: boolean;
  // The tags of hidden orientations: a title with one is always hidden, so
  // sources may leave them out where they can
  hiddenTagIds: T[];
  // Asked for tagged titles only, which leaves out unidentified ones
  narrowed: boolean;
  // A picked tag stands for a hidden orientation, or the orientation tags
  // asked for are all excluded, so no title can show
  empty: boolean;
  // A picked tag stands for an orientation, so no title is unidentified
  identified: boolean;
}

// The tags a list asks its source for, given the picked tags, which titles
// need all of, the excluded ones, and the orientations it hides
export const planOrientationTags = <T extends string | number>(
  user: User | undefined,
  {
    orientation,
    picked,
    excluded = [],
  }: { orientation?: string; picked: T[]; excluded?: T[] },
  ids: Partial<Record<Orientation, T>>,
  narrow: Narrow = 'needed'
): OrientationTagPlan<T> => {
  const hidden = hiddenOrientations(user, orientation);
  // stash-box finds nothing when a tag needed by all is asked for twice
  const tags = [...new Set(picked)];
  const hiddenTagIds = orientationTagIds(ids, [...hidden]);
  const known = new Set(Object.values(ids));
  const identified = tags.some((id) => known.has(id));
  const wanted = orientationTagIds(ids, tagsNeeded(hidden));
  // Excluded orientation tags are never asked for
  const needed = wanted.filter((id) => !excluded.includes(id));
  // Without straight, titles tagged with a shown orientation are asked for:
  // any of them without picked tags, or the one shown next to all of those
  const narrows = (values: T[]) =>
    narrow !== 'none' &&
    values.length > 0 &&
    (!tags.length || values.length === 1);
  const narrowed = narrows(needed);
  // When every tag the list would ask for is excluded, the tagged titles
  // it shows are all left out. Unidentified ones still show, by filtering,
  // when picked; otherwise nothing does
  const excludedAway = !narrowed && narrows(wanted);

  return {
    hidden,
    tagIds: narrowed ? [...new Set([...tags, ...needed])] : tags,
    anyTag: narrowed && !tags.length,
    hiddenTagIds,
    narrowed,
    empty:
      tags.some((id) => hiddenTagIds.includes(id)) ||
      (excludedAway && (identified || hidden.has('unidentified'))),
    identified,
  };
};

// Unidentified titles carry no orientation tag, so when they show next to
// tagged ones a narrowed list reads them apart and joins them in
export const joinedPlan = <
  P extends {
    narrowed: boolean;
    identified: boolean;
    filter: { hidden: Set<Orientation> };
  },
>(
  plan: P,
  planWith: (narrow: Narrow) => P
): P | undefined =>
  plan.narrowed && !plan.identified && !plan.filter.hidden.has('unidentified')
    ? planWith('none')
    : undefined;

// A list filter that keeps only unidentified titles
export const onlyUnidentified = <F extends { hidden: Set<Orientation> }>(
  filter: F
): F => ({
  ...filter,
  hidden: new Set(ORIENTATIONS.filter((key) => key !== 'unidentified')),
});
