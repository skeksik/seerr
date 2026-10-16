import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import OrientationSelector from '@app/components/OrientationSelector';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import Datepicker from '@seerr-team/react-tailwindcss-datepicker';
import type { Orientation } from '@server/lib/orientation';
import { isOrientation, ORIENTATIONS } from '@server/lib/orientation';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { MultiValue, SingleValue } from 'react-select';
import AsyncSelect from 'react-select/async';
import { useSWRConfig } from 'swr';

const messages = defineMessages('components.AdultFilterSlideover', {
  filters: 'Filters',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
  releaseDate: 'Release Date',
  releasedEq: 'Equal',
  releasedGt: 'Greater',
  releasedGte: 'Greater or Equal',
  releasedLt: 'Less',
  releasedLte: 'Less or Equal',
  sexualPreferences: 'Sexual Preferences',
  studios: 'Studios',
  studio: 'Studio',
  excludeStudios: 'Exclude Studios',
  performers: 'Performers',
  excludePerformers: 'Exclude Performers',
  tags: 'Tags',
  excludeTags: 'Exclude Tags',
  modeAnd: 'And',
  modeOr: 'Or',
  modeAndTip: 'Titles with all of them',
  modeOrTip: 'Titles with any of them',
  search: 'Search…',
  startTyping: 'Start typing to search.',
  clearfilters: 'Clear Active Filters',
});

// Also the browse pages' Filters button
export const activeFiltersMessage = messages.activefilters;

// Scenes filter on StashDB; adult movies on ThePornDB
export type AdultFilterKind = 'scene' | 'adultmovie';

// Filters that count as active; the others only qualify them
const countedParams = [
  'releaseDate',
  'orientation',
  'studio',
  'studioExclude',
  'performer',
  'performerExclude',
  'tags',
  'tagsExclude',
  'tag',
] as const;

// The filter params the browse APIs take
export const adultFilterParams = [
  ...countedParams,
  'released',
  'performerMode',
  'tagMode',
] as const;

// Query params the filters own; everything else (like sort) is kept.
// ThePornDB's tag names only ride along for the panel
const filterKeys = [
  ...adultFilterParams,
  'tagNames',
  'tagsExcludeNames',
] as const;

type Option = { value: string; label: string };

// Each field and its Exclude twin
const studioParams = ['studio', 'studioExclude'];
const performerParams = ['performer', 'performerExclude'];
const tagParams = ['tags', 'tag', 'tagsExclude'];

// The date picker drops leading zeros (2026-10-7); the API wants YYYY-MM-DD
const toIsoDate = (value: Date | string) =>
  typeof value === 'string'
    ? value
        .split('-')
        .map((part, index) => (index > 0 ? part.padStart(2, '0') : part))
        .join('-')
    : [
        value.getFullYear(),
        String(value.getMonth() + 1).padStart(2, '0'),
        String(value.getDate()).padStart(2, '0'),
      ].join('-');

const param = (value: string | string[] | undefined) =>
  typeof value === 'string' && value !== '' ? value : undefined;

export const countAdultFilters = (
  query: Record<string, string | string[] | undefined>
): number => countedParams.filter((key) => param(query[key])).length;

interface LookupSelectProps {
  inputId: string;
  isMulti: boolean;
  ids: string[];
  // Search endpoint taking ?query=
  searchUrl: string;
  // The other filters, so suggestions that find nothing are left out
  context?: Record<string, string | undefined>;
  // The params this field and its Exclude twin set, whose picks should not
  // remount it
  ownParams: string[];
  // Where already-selected ids are named, e.g. after a page reload
  nameUrl?: (id: string) => string;
  knownNames?: string[];
  onChange: (options: Option[]) => void;
}

const toQuery = (context: Record<string, string | undefined>) =>
  new URLSearchParams(
    Object.entries(context).flatMap(([name, value]) =>
      value ? [[name, value]] : []
    )
  ).toString();

const LookupSelect = ({
  inputId,
  isMulti,
  ids,
  searchUrl,
  context = {},
  ownParams,
  nameUrl,
  knownNames,
  onChange,
}: LookupSelectProps) => {
  const intl = useIntl();
  const { cache, mutate } = useSWRConfig();
  const [selected, setSelected] = useState<Option[]>([]);
  const key = ids.join(',');
  const contextKey = toQuery(context);
  // Suggestions depend on the other fields' picks
  const otherKey = toQuery(
    Object.fromEntries(
      Object.entries(context).filter(([name]) => !ownParams.includes(name))
    )
  );

  // Names come from the performer and studio pages' own requests, so a page
  // seen before needs none, and one opened later finds it cached
  const resolveName = async (url: string): Promise<string | undefined> => {
    const cached = cache.get(url)?.data as { name: string } | undefined;
    if (cached) {
      return cached.name;
    }
    const data = await mutate<{ name: string }>(
      url,
      axios.get<{ name: string }>(url).then((response) => response.data),
      { revalidate: false }
    );
    return data?.name;
  };

  useEffect(() => {
    let cancelled = false;

    Promise.all(
      ids.map(async (id, index) => {
        const known =
          selected.find((option) => option.value === id)?.label ??
          knownNames?.[index];
        if (known) {
          return { value: id, label: known };
        }
        try {
          return {
            value: id,
            label: (nameUrl && (await resolveName(nameUrl(id)))) || id,
          };
        } catch {
          return { value: id, label: id };
        }
      })
    ).then((options) => {
      if (!cancelled) {
        setSelected(options);
      }
    });

    return () => {
      cancelled = true;
    };
    // Only re-resolve when the ids change
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const loadOptions = async (query: string): Promise<Option[]> => {
    if (!query) {
      return [];
    }

    const { data } = await axios.get<
      {
        id: string | number;
        name: string;
        disambiguation?: string | null;
      }[]
    >(
      `${searchUrl}?query=${encodeURIComponent(query)}${
        contextKey ? `&${contextKey}` : ''
      }`
    );

    return data.map((item) => ({
      value: String(item.id),
      label: item.disambiguation
        ? `${item.name} (${item.disambiguation})`
        : item.name,
    }));
  };

  return (
    <AsyncSelect<Option, boolean>
      key={otherKey}
      inputId={inputId}
      className="react-select-container"
      classNamePrefix="react-select"
      isMulti={isMulti}
      isClearable
      cacheOptions
      loadOptions={loadOptions}
      value={isMulti ? selected : (selected[0] ?? null)}
      placeholder={intl.formatMessage(messages.search)}
      noOptionsMessage={({ inputValue }) =>
        intl.formatMessage(
          inputValue ? globalMessages.noresults : messages.startTyping
        )
      }
      onChange={(value: MultiValue<Option> | SingleValue<Option>) => {
        const options = Array.isArray(value)
          ? [...value]
          : value
            ? [value as Option]
            : [];
        setSelected(options);
        onChange(options);
      }}
    />
  );
};

interface ModeToggleProps {
  mode: 'and' | 'or';
  onChange: (mode: 'and' | 'or') => void;
}

// Whether titles need all of the picked performers or tags, or any
const ModeToggle = ({ mode, onChange }: ModeToggleProps) => {
  const intl = useIntl();

  return (
    <div className="flex overflow-hidden rounded-md border border-gray-500 text-xs font-medium">
      {(['and', 'or'] as const).map((value) => (
        <button
          key={value}
          type="button"
          aria-pressed={mode === value}
          title={intl.formatMessage(
            value === 'and' ? messages.modeAndTip : messages.modeOrTip
          )}
          onClick={() => onChange(value)}
          className={`px-3 py-1 transition-colors ${
            mode === value
              ? 'bg-indigo-600 text-white'
              : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
          }`}
        >
          {intl.formatMessage(
            value === 'and' ? messages.modeAnd : messages.modeOr
          )}
        </button>
      ))}
    </div>
  );
};

const SectionTitle = ({
  children,
  action,
}: {
  children: React.ReactNode;
  action?: React.ReactNode;
}) => (
  <div className="flex items-center justify-between">
    <span className="text-lg font-semibold">{children}</span>
    {action}
  </div>
);

// The user's sexual preferences: those picked by default, and those offered
const useOrientationDefaults = () => {
  const { user } = useUser();
  const disabled = (user?.settings?.disabledOrientations ?? []).filter(
    isOrientation
  );
  const unchecked = (user?.settings?.uncheckedOrientations ?? []).filter(
    isOrientation
  );
  const options = ORIENTATIONS.filter((value) => !disabled.includes(value));

  return {
    options,
    defaults: options.filter((value) => !unchecked.includes(value)),
  };
};

interface AdultFilterSlideoverProps {
  kind: AdultFilterKind;
  show: boolean;
  onClose: () => void;
}

const AdultFilterSlideover = ({
  kind,
  show,
  onClose,
}: AdultFilterSlideoverProps) => {
  const intl = useIntl();
  const router = useRouter();
  const batchUpdate = useBatchUpdateQueryParams(router.query);
  const { options: orientationOptions, defaults: orientationDefaults } =
    useOrientationDefaults();

  // How the release date compares; older links say after or before
  const releasedParam = param(router.query.released);
  const released =
    releasedParam === 'after'
      ? 'gte'
      : releasedParam === 'before'
        ? 'lt'
        : (releasedParam ?? 'gte');
  const releaseDate = param(router.query.releaseDate);
  const orientationParam = param(router.query.orientation);
  const orientations: Orientation[] = orientationParam
    ? orientationParam.split(',').filter(isOrientation)
    : orientationDefaults;
  const studio = param(router.query.studio);
  const studioExclude = param(router.query.studioExclude);
  const performer = param(router.query.performer);
  const performerExclude = param(router.query.performerExclude);
  const performerMode =
    param(router.query.performerMode) === 'or' ? 'or' : 'and';
  const tags = param(router.query.tags)?.split(',') ?? [];
  const tagsExclude = param(router.query.tagsExclude);
  const tagMode = param(router.query.tagMode) === 'or' ? 'or' : 'and';
  const tagNames = param(router.query.tagNames)?.split('|');
  const tagsExcludeNames = param(router.query.tagsExcludeNames)?.split('|');
  const isScene = kind === 'scene';
  const lookupBase = isScene ? '/api/v1/scene/lookup' : '/api/v1/adultmovie';
  const nameUrl = (type: 'studio' | 'performer' | 'tag') => (id: string) =>
    `/api/v1/${kind}/${type}/${id}`;
  const activeFilters = countAdultFilters(router.query);

  // Every field's suggestions are checked against all the picked filters,
  // so nothing that would find no title is offered
  const context = Object.fromEntries(
    adultFilterParams.map((key) => [key, param(router.query[key])])
  );
  const ids = (value?: string) => value?.split(',') ?? [];
  const joined = (options: Option[]) =>
    options.map((option) => option.value).join(',') || undefined;
  const sameAsDefaults = (values: Orientation[]) =>
    values.length === orientationDefaults.length &&
    values.every((value) => orientationDefaults.includes(value));

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: activeFilters,
      })}
      onClose={onClose}
    >
      <div className="flex flex-col space-y-4">
        <div>
          <div className="mb-2 text-lg font-semibold">
            {intl.formatMessage(messages.releaseDate)}
          </div>
          <div className="relative z-40 flex space-x-2">
            <select
              id="released"
              className="w-44 flex-none"
              value={released}
              onChange={(e) =>
                batchUpdate({
                  released:
                    e.target.value === 'gte' ? undefined : e.target.value,
                })
              }
            >
              {(
                [
                  ['eq', messages.releasedEq],
                  ['gt', messages.releasedGt],
                  ['gte', messages.releasedGte],
                  ['lt', messages.releasedLt],
                  ['lte', messages.releasedLte],
                ] as const
              ).map(([value, message]) => (
                <option key={value} value={value}>
                  {intl.formatMessage(message)}
                </option>
              ))}
            </select>
            <Datepicker
              primaryColor="indigo"
              value={{
                startDate: releaseDate ?? null,
                endDate: releaseDate ?? null,
              }}
              onChange={(value) =>
                batchUpdate({
                  releaseDate: value?.startDate
                    ? toIsoDate(value.startDate)
                    : undefined,
                })
              }
              inputName="releaseDate"
              useRange={false}
              asSingle
              containerClassName="datepicker-wrapper"
              inputClassName="pr-1 sm:pr-4 text-base leading-5"
            />
          </div>
        </div>
        {orientationOptions.length > 0 && (
          <>
            <SectionTitle>
              {intl.formatMessage(messages.sexualPreferences)}
            </SectionTitle>
            <OrientationSelector
              options={orientationOptions}
              selected={orientations}
              onChange={(values) =>
                batchUpdate({
                  // "none" keeps an empty pick apart from the defaults
                  orientation: sameAsDefaults(values)
                    ? undefined
                    : values.join(',') || 'none',
                })
              }
            />
          </>
        )}
        <SectionTitle>
          {/* ThePornDB filters on a single studio */}
          {intl.formatMessage(isScene ? messages.studios : messages.studio)}
        </SectionTitle>
        <LookupSelect
          inputId="studioFilter"
          isMulti={isScene}
          ids={ids(studio)}
          searchUrl={`${lookupBase}/studios`}
          context={context}
          ownParams={studioParams}
          nameUrl={nameUrl('studio')}
          onChange={(options) => batchUpdate({ studio: joined(options) })}
        />
        <SectionTitle>
          {intl.formatMessage(messages.excludeStudios)}
        </SectionTitle>
        <LookupSelect
          inputId="studioExcludeFilter"
          isMulti
          context={context}
          ids={ids(studioExclude)}
          searchUrl={`${lookupBase}/studios`}
          ownParams={studioParams}
          nameUrl={nameUrl('studio')}
          onChange={(options) =>
            batchUpdate({ studioExclude: joined(options) })
          }
        />
        <SectionTitle
          action={
            <ModeToggle
              mode={performerMode}
              onChange={(mode) =>
                batchUpdate({
                  performerMode: mode === 'or' ? 'or' : undefined,
                })
              }
            />
          }
        >
          {intl.formatMessage(messages.performers)}
        </SectionTitle>
        <LookupSelect
          inputId="performerFilter"
          isMulti
          ids={ids(performer)}
          searchUrl={`${lookupBase}/performers`}
          context={context}
          ownParams={performerParams}
          nameUrl={nameUrl('performer')}
          onChange={(options) => batchUpdate({ performer: joined(options) })}
        />
        <SectionTitle>
          {intl.formatMessage(messages.excludePerformers)}
        </SectionTitle>
        <LookupSelect
          inputId="performerExcludeFilter"
          isMulti
          context={context}
          ids={ids(performerExclude)}
          searchUrl={`${lookupBase}/performers`}
          ownParams={performerParams}
          nameUrl={nameUrl('performer')}
          onChange={(options) =>
            batchUpdate({ performerExclude: joined(options) })
          }
        />
        <SectionTitle
          action={
            <ModeToggle
              mode={tagMode}
              onChange={(mode) =>
                batchUpdate({ tagMode: mode === 'or' ? 'or' : undefined })
              }
            />
          }
        >
          {intl.formatMessage(messages.tags)}
        </SectionTitle>
        <LookupSelect
          inputId="tagFilter"
          isMulti
          ids={tags}
          searchUrl={`${lookupBase}/tags`}
          context={context}
          ownParams={tagParams}
          // ThePornDB cannot look tags up by id, so their names ride along
          nameUrl={isScene ? nameUrl('tag') : undefined}
          knownNames={isScene ? undefined : tagNames}
          onChange={(options) =>
            batchUpdate({
              tags: joined(options),
              tagNames: isScene
                ? undefined
                : options.map((option) => option.label).join('|') || undefined,
            })
          }
        />
        <SectionTitle>{intl.formatMessage(messages.excludeTags)}</SectionTitle>
        <LookupSelect
          inputId="tagExcludeFilter"
          isMulti
          context={context}
          ids={ids(tagsExclude)}
          searchUrl={`${lookupBase}/tags`}
          ownParams={tagParams}
          nameUrl={isScene ? nameUrl('tag') : undefined}
          knownNames={isScene ? undefined : tagsExcludeNames}
          onChange={(options) =>
            batchUpdate({
              tagsExclude: joined(options),
              tagsExcludeNames: isScene
                ? undefined
                : options.map((option) => option.label).join('|') || undefined,
            })
          }
        />
        <div className="pt-4">
          <Button
            className="w-full"
            disabled={activeFilters === 0}
            onClick={() =>
              batchUpdate(
                Object.fromEntries(filterKeys.map((key) => [key, undefined]))
              )
            }
          >
            <XCircleIcon />
            <span>{intl.formatMessage(messages.clearfilters)}</span>
          </Button>
        </div>
      </div>
    </SlideOver>
  );
};

export default AdultFilterSlideover;
