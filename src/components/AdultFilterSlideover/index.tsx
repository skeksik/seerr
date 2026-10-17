import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import Datepicker from '@seerr-team/react-tailwindcss-datepicker';
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
  studios: 'Studios',
  studio: 'Studio',
  excludeStudios: 'Exclude Studios',
  performers: 'Performers',
  excludePerformers: 'Exclude Performers',
  tags: 'Tags',
  excludeTags: 'Exclude Tags',
  search: 'Search…',
  startTyping: 'Start typing to search.',
  clearfilters: 'Clear Active Filters',
});

// Also the browse pages' Filters button
export const activeFiltersMessage = messages.activefilters;

// Scenes filter on StashDB; adult movies on ThePornDB, whose studios and
// performers are picked among StashDB's linked to it, and whose tags are
// its own
export type AdultFilterKind = 'scene' | 'adultmovie';

// Filters that count as active; the release comparison only qualifies the
// date
const countedParams = [
  'releaseDate',
  'studio',
  'studioExclude',
  'performer',
  'performerExclude',
  'tags',
  'tagsExclude',
] as const;

// The filter params the browse APIs take
export const adultFilterParams = [...countedParams, 'released'] as const;

// Query params the filters own; everything else (like sort) is kept.
// ThePornDB's tag names only ride along for the panel
// The And/Or modes of older links go too
const filterKeys = [
  ...adultFilterParams,
  'tagNames',
  'tagsExcludeNames',
  'performerMode',
  'tagMode',
] as const;

type Option = { value: string; label: string };

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
  // Search endpoint taking ?query=, answering with what the source finds
  searchUrl: string;
  // Where already-selected ids are named, e.g. after a page reload
  nameUrl?: (id: string) => string;
  knownNames?: string[];
  onChange: (options: Option[]) => void;
}

const LookupSelect = ({
  inputId,
  isMulti,
  ids,
  searchUrl,
  nameUrl,
  knownNames,
  onChange,
}: LookupSelectProps) => {
  const intl = useIntl();
  const { cache, mutate } = useSWRConfig();
  const [selected, setSelected] = useState<Option[]>([]);
  const key = ids.join(',');

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
    >(`${searchUrl}?query=${encodeURIComponent(query)}`);

    return data.map((item) => ({
      value: String(item.id),
      label: item.disambiguation
        ? `${item.name} (${item.disambiguation})`
        : item.name,
    }));
  };

  return (
    <AsyncSelect<Option, boolean>
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

const SectionTitle = ({ children }: { children: React.ReactNode }) => (
  <div className="text-lg font-semibold">{children}</div>
);

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

  // How the release date compares
  const released = param(router.query.released) ?? 'gte';
  const releaseDate = param(router.query.releaseDate);
  const studio = param(router.query.studio);
  const studioExclude = param(router.query.studioExclude);
  const performer = param(router.query.performer);
  const performerExclude = param(router.query.performerExclude);
  const tags = param(router.query.tags)?.split(',') ?? [];
  const tagsExclude = param(router.query.tagsExclude);
  const tagNames = param(router.query.tagNames)?.split('|');
  const tagsExcludeNames = param(router.query.tagsExcludeNames)?.split('|');
  const isScene = kind === 'scene';
  const lookupBase = isScene ? '/api/v1/scene/lookup' : '/api/v1/adultmovie';
  // Picked studios and performers are StashDB's for both, so its pages name
  // them; only scene tags are
  const nameUrl = (type: 'studio' | 'performer' | 'tag') => (id: string) =>
    `/api/v1/scene/${type}/${id}`;
  const activeFilters = countAdultFilters(router.query);

  const ids = (value?: string) => value?.split(',') ?? [];
  const joined = (options: Option[]) =>
    options.map((option) => option.value).join(',') || undefined;

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
        <SectionTitle>
          {/* ThePornDB filters on one site, so movies take one studio */}
          {intl.formatMessage(isScene ? messages.studios : messages.studio)}
        </SectionTitle>
        <LookupSelect
          inputId="studioFilter"
          isMulti={isScene}
          ids={ids(studio)}
          searchUrl={`${lookupBase}/studios`}
          nameUrl={nameUrl('studio')}
          onChange={(options) => batchUpdate({ studio: joined(options) })}
        />
        <SectionTitle>
          {intl.formatMessage(messages.excludeStudios)}
        </SectionTitle>
        <LookupSelect
          inputId="studioExcludeFilter"
          isMulti
          ids={ids(studioExclude)}
          searchUrl={`${lookupBase}/studios`}
          nameUrl={nameUrl('studio')}
          onChange={(options) =>
            batchUpdate({ studioExclude: joined(options) })
          }
        />
        <SectionTitle>{intl.formatMessage(messages.performers)}</SectionTitle>
        <LookupSelect
          inputId="performerFilter"
          isMulti
          ids={ids(performer)}
          searchUrl={`${lookupBase}/performers`}
          nameUrl={nameUrl('performer')}
          onChange={(options) => batchUpdate({ performer: joined(options) })}
        />
        <SectionTitle>
          {intl.formatMessage(messages.excludePerformers)}
        </SectionTitle>
        <LookupSelect
          inputId="performerExcludeFilter"
          isMulti
          ids={ids(performerExclude)}
          searchUrl={`${lookupBase}/performers`}
          nameUrl={nameUrl('performer')}
          onChange={(options) =>
            batchUpdate({ performerExclude: joined(options) })
          }
        />
        <SectionTitle>{intl.formatMessage(messages.tags)}</SectionTitle>
        <LookupSelect
          inputId="tagFilter"
          isMulti
          ids={tags}
          searchUrl={`${lookupBase}/tags`}
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
          ids={ids(tagsExclude)}
          searchUrl={`${lookupBase}/tags`}
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
