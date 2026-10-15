import Button from '@app/components/Common/Button';
import SlideOver from '@app/components/Common/SlideOver';
import { CompanySelector } from '@app/components/Selector';
import { useBatchUpdateQueryParams } from '@app/hooks/useUpdateQueryParams';
import defineMessages from '@app/utils/defineMessages';
import { XCircleIcon } from '@heroicons/react/24/outline';
import Datepicker from '@seerr-team/react-tailwindcss-datepicker';
import axios from 'axios';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import type { MultiValue, SingleValue } from 'react-select';
import AsyncSelect from 'react-select/async';

const messages = defineMessages('components.AdultFilterSlideover', {
  filters: 'Filters',
  activefilters:
    '{count, plural, one {# Active Filter} other {# Active Filters}}',
  releaseDate: 'Release Date',
  releasedAfter: 'Released after',
  releasedBefore: 'Released before',
  studios: 'Studios',
  studio: 'Studio',
  performers: 'Performers',
  tags: 'Tags',
  search: 'Search…',
  clearfilters: 'Clear Active Filters',
});

// Scenes filter on StashDB; XXX movies on ThePornDB or TMDB studios
export type AdultFilterKind = 'scene' | 'tpdb' | 'tmdb';

// Query params the filters own; everything else (like sort) is kept
const filterKeys = [
  'released',
  'releaseDate',
  'studio',
  'performer',
  'tags',
  'tagNames',
  'tag',
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
): number =>
  ['releaseDate', 'studio', 'performer', 'tags', 'tag'].filter((key) =>
    param(query[key])
  ).length;

interface LookupSelectProps {
  inputId: string;
  isMulti: boolean;
  ids: string[];
  // Search endpoint taking ?query=
  searchUrl: string;
  // Names already-selected ids, e.g. after a page reload
  resolveName?: (id: string) => Promise<string>;
  knownNames?: string[];
  onChange: (options: Option[]) => void;
}

const LookupSelect = ({
  inputId,
  isMulti,
  ids,
  searchUrl,
  resolveName,
  knownNames,
  onChange,
}: LookupSelectProps) => {
  const intl = useIntl();
  const [selected, setSelected] = useState<Option[]>([]);
  const key = ids.join(',');

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
          return { value: id, label: (await resolveName?.(id)) ?? id };
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

  const released = param(router.query.released) ?? 'after';
  const releaseDate = param(router.query.releaseDate);
  const studio = param(router.query.studio);
  const performer = param(router.query.performer);
  const tags = [
    ...(param(router.query.tags)?.split(',') ?? []),
    ...(param(router.query.tag) ? [param(router.query.tag) as string] : []),
  ];
  const tagNames = param(router.query.tagNames)?.split('|');
  const isScene = kind === 'scene';
  const lookupBase = isScene ? '/api/v1/scene/lookup' : '/api/v1/xxxmovie';
  const nameUrl = (type: 'studio' | 'performer' | 'tag', id: string) =>
    isScene ? `/api/v1/scene/${type}/${id}` : `/api/v1/xxxmovie/${type}/${id}`;
  const resolveName =
    (type: 'studio' | 'performer' | 'tag') => async (id: string) =>
      (await axios.get<{ name: string }>(nameUrl(type, id))).data.name;

  return (
    <SlideOver
      show={show}
      title={intl.formatMessage(messages.filters)}
      subText={intl.formatMessage(messages.activefilters, {
        count: countAdultFilters(router.query),
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
                  released: e.target.value === 'after' ? undefined : 'before',
                })
              }
            >
              <option value="after">
                {intl.formatMessage(messages.releasedAfter)}
              </option>
              <option value="before">
                {intl.formatMessage(messages.releasedBefore)}
              </option>
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
        <span className="text-lg font-semibold">
          {/* ThePornDB and TMDB filter on a single studio */}
          {intl.formatMessage(isScene ? messages.studios : messages.studio)}
        </span>
        {kind === 'tmdb' ? (
          <CompanySelector
            defaultValue={studio}
            onChange={(value) =>
              batchUpdate({ studio: value ? String(value.value) : undefined })
            }
          />
        ) : (
          <LookupSelect
            inputId="studioFilter"
            isMulti={isScene}
            ids={studio?.split(',') ?? []}
            searchUrl={`${lookupBase}/studios`}
            resolveName={resolveName('studio')}
            onChange={(options) =>
              batchUpdate({
                studio:
                  options.map((option) => option.value).join(',') || undefined,
              })
            }
          />
        )}
        {kind !== 'tmdb' && (
          <>
            <span className="text-lg font-semibold">
              {intl.formatMessage(messages.performers)}
            </span>
            <LookupSelect
              inputId="performerFilter"
              isMulti
              ids={performer?.split(',') ?? []}
              searchUrl={`${lookupBase}/performers`}
              resolveName={resolveName('performer')}
              onChange={(options) =>
                batchUpdate({
                  performer:
                    options.map((option) => option.value).join(',') ||
                    undefined,
                })
              }
            />
            <span className="text-lg font-semibold">
              {intl.formatMessage(messages.tags)}
            </span>
            <LookupSelect
              inputId="tagFilter"
              isMulti
              ids={tags}
              searchUrl={`${lookupBase}/tags`}
              // ThePornDB cannot look tags up by id, so their names ride along
              resolveName={isScene ? resolveName('tag') : undefined}
              knownNames={isScene ? undefined : tagNames}
              onChange={(options) =>
                batchUpdate({
                  tag: undefined,
                  tags:
                    options.map((option) => option.value).join(',') ||
                    undefined,
                  tagNames: isScene
                    ? undefined
                    : options.map((option) => option.label).join('|') ||
                      undefined,
                })
              }
            />
          </>
        )}
        {countAdultFilters(router.query) > 0 && (
          <div className="pt-4">
            <Button
              className="w-full"
              buttonType="primary"
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
        )}
      </div>
    </SlideOver>
  );
};

export default AdultFilterSlideover;
