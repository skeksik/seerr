import { VerifyClearIndicator } from '@app/components/BlocklistedTagsSelector';
import Modal from '@app/components/Common/Modal';
import Tooltip from '@app/components/Common/Tooltip';
import CopyButton from '@app/components/Settings/CopyButton';
import useToasts from '@app/hooks/useToasts';
import type {
  AdultTagKind,
  AdultTagListError,
  ParsedAdultTag,
} from '@app/utils/adultTagList';
import { formatAdultTags, parseAdultTags } from '@app/utils/adultTagList';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';
import { ArrowDownIcon } from '@heroicons/react/24/solid';
import axios from 'axios';
import { useFormikContext } from 'formik';
import { useCallback, useState } from 'react';
import { useIntl } from 'react-intl';
import type { MultiValue } from 'react-select';
import AsyncSelect from 'react-select/async';

const messages = defineMessages('components.AdultBlocklistedTagsSelector', {
  searchStashDbTags: 'Search StashDB tags…',
  searchTpdbTags: 'Search ThePornDB tags…',
  starttyping: 'Start typing to search.',
  nooptions: 'No results.',
  copyTags: 'Copied blocklisted tags to clipboard.',
  copyTagsTip: 'Copy blocklisted tag configuration',
  copyTagsEmpty: 'Nothing to copy',
  importTagsTip: 'Import blocklisted tag configuration',
  importTitle: 'Import Blocklisted Tag Configuration',
  importStashDbInstructions:
    'Paste blocklist tag configuration below: StashDB tags as id:Name, or tag ids alone, separated by commas.',
  importTpdbInstructions:
    'Paste blocklist tag configuration below: ThePornDB tags as id:Name, or tag ids alone, separated by commas. Tag ids alone are named from ThePornDB’s tag list, which takes a few seconds.',
  confirm: 'Confirm',
  valueRequired: 'You must provide a value.',
  emptyEntry:
    'Tags must be separated by single commas, and the configuration must not start or end with a comma.',
  danglingEscape:
    'A backslash must be followed by the character it keeps, such as a comma in a name.',
  invalidStashDbId: '{entry} does not start with a StashDB tag id.',
  invalidTpdbId: '{entry} does not start with a ThePornDB tag id.',
  notStashDbTag: '{tagId} is not a StashDB tag.',
  stashDbLookupFailed: 'Could not look up StashDB tag {tagId}.',
  unnamedTpdbTags:
    'ThePornDB’s tag list has no {count, plural, one {tag} other {tags}} {tagIds}, so {count, plural, one {it was} other {they were}} imported named by id.',
  tpdbLookupFailed:
    'Could not read ThePornDB’s tag list, so {count, plural, one {tag} other {tags}} {tagIds} {count, plural, one {was} other {were}} imported named by id.',
});

type Option = { label: string; value: string };

// The settings each kind keeps its tags in: ids, and their names, which
// ThePornDB cannot look up by id
const fields = {
  scene: {
    ids: 'blocklistedSceneTags',
    names: 'blocklistedSceneTagNames',
    searchUrl: '/api/v1/scene/lookup/tags',
    placeholder: messages.searchStashDbTags,
  },
  adultmovie: {
    ids: 'blocklistedAdultMovieTags',
    names: 'blocklistedAdultMovieTagNames',
    searchUrl: '/api/v1/adultmovie/tags',
    placeholder: messages.searchTpdbTags,
  },
} as const;

// What a ThePornDB tag no name was found for is called
const placeholderName = (id: string) => `Tag ${id}`;

interface AdultBlocklistedTagsSelectorProps {
  mediaType: AdultTagKind;
}

// BlocklistedTagsSelector for StashDB tags of scenes and ThePornDB tags of
// adult movies, with its copy and import buttons. They copy the names with
// the ids, as ThePornDB cannot name a tag by its id
const AdultBlocklistedTagsSelector = ({
  mediaType,
}: AdultBlocklistedTagsSelectorProps) => {
  const intl = useIntl();
  const { values, setFieldValue } =
    useFormikContext<Record<string, string | undefined>>();
  const field = fields[mediaType];
  const names = (values[field.names] ?? '').split('|');
  const selected: Option[] = (values[field.ids] ?? '')
    .split(',')
    .map((id, index) => ({ value: id, label: names[index] || id }))
    .filter((option) => option.value !== '');

  const update = useCallback(
    (options: MultiValue<Option> | null) => {
      setFieldValue(field.ids, (options ?? []).map((o) => o.value).join(','));
      setFieldValue(
        field.names,
        // | separates the names
        (options ?? []).map((o) => o.label.replace(/\|/g, '/')).join('|')
      );
    },
    [field, setFieldValue]
  );

  const loadOptions = async (inputValue: string): Promise<Option[]> => {
    if (!inputValue) {
      return [];
    }

    const { data } = await axios.get<{ id: string | number; name: string }[]>(
      field.searchUrl,
      { params: { query: inputValue } }
    );

    return data.map((tag) => ({ value: String(tag.id), label: tag.name }));
  };

  const copyDisabled = selected.length === 0;

  return (
    <>
      <AsyncSelect
        key={`tag-select-${field.ids}`}
        inputId={field.ids}
        isMulti
        className="react-select-container"
        classNamePrefix="react-select"
        noOptionsMessage={({ inputValue }) =>
          inputValue === ''
            ? intl.formatMessage(messages.starttyping)
            : intl.formatMessage(messages.nooptions)
        }
        value={selected}
        loadOptions={loadOptions}
        placeholder={intl.formatMessage(field.placeholder)}
        onChange={update}
        components={{
          DropdownIndicator: undefined,
          IndicatorSeparator: undefined,
          ClearIndicator: VerifyClearIndicator,
        }}
      />
      <CopyButton
        textToCopy={formatAdultTags(
          selected.map(({ value, label }) => ({
            id: value,
            // Tags saved without a name show their id
            name: label === value ? '' : label,
          }))
        )}
        disabled={copyDisabled}
        toastMessage={intl.formatMessage(messages.copyTags)}
        tooltipContent={intl.formatMessage(
          copyDisabled ? messages.copyTagsEmpty : messages.copyTagsTip
        )}
        tooltipConfig={{ followCursor: false }}
      />
      <AdultTagsImportButton mediaType={mediaType} onImport={update} />
    </>
  );
};

interface AdultTagsImportButtonProps {
  mediaType: AdultTagKind;
  onImport: (options: Option[]) => void;
}

// Like BlocklistedTagsImportButton: its modal replaces the tags with the
// pasted ones once they all check out
const AdultTagsImportButton = ({
  mediaType,
  onImport,
}: AdultTagsImportButtonProps) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [show, setShow] = useState(false);
  const [formValue, setFormValue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const syntaxError = (error: AdultTagListError): string => {
    switch (error.type) {
      case 'emptyEntry':
        return intl.formatMessage(messages.emptyEntry);
      case 'danglingEscape':
        return intl.formatMessage(messages.danglingEscape);
      case 'invalidId':
        return intl.formatMessage(
          mediaType === 'scene'
            ? messages.invalidStashDbId
            : messages.invalidTpdbId,
          { entry: error.entry }
        );
    }
  };

  // StashDB names every tag by id, so each is checked and named by it
  const nameStashDbTags = async (
    tags: ParsedAdultTag[]
  ): Promise<{ options: Option[]; errors: string[] }> => {
    const results = await Promise.allSettled(
      tags.map(({ id }) =>
        axios.get<{ id: string; name: string }>(`/api/v1/scene/tag/${id}`)
      )
    );
    const options: Option[] = [];
    const failures: string[] = [];

    results.forEach((result, index) => {
      const tag = tags[index];

      if (result.status === 'fulfilled') {
        options.push({ value: tag.id, label: result.value.data.name });
      } else if (result.reason?.response?.status === 404) {
        failures.push(
          intl.formatMessage(messages.notStashDbTag, { tagId: tag.id })
        );
      } else if (tag.name) {
        // StashDB is out of reach: the copied name will do
        options.push({ value: tag.id, label: tag.name });
      } else {
        failures.push(
          intl.formatMessage(messages.stashDbLookupFailed, { tagId: tag.id })
        );
      }
    });

    return { options, errors: failures };
  };

  // ThePornDB tags keep their copied names; ids alone are looked up in its
  // tag list, and the ones it lacks are named by id
  const nameTpdbTags = async (tags: ParsedAdultTag[]): Promise<Option[]> => {
    const unnamed = tags.filter((tag) => !tag.name).map((tag) => tag.id);
    const found = new Map<string, string>();
    let lookupFailed = false;

    if (unnamed.length > 0) {
      try {
        const { data } = await axios.get<{ id: number; name: string }[]>(
          '/api/v1/adultmovie/tags/names',
          { params: { ids: unnamed.join(',') } }
        );
        data.forEach((tag) => found.set(String(tag.id), tag.name));
      } catch {
        lookupFailed = true;
      }
    }

    const missing = unnamed.filter((id) => !found.has(id));

    if (missing.length > 0) {
      addToast(
        intl.formatMessage(
          lookupFailed ? messages.tpdbLookupFailed : messages.unnamedTpdbTags,
          { count: missing.length, tagIds: missing.join(', ') }
        ),
        { appearance: 'warning', autoDismiss: true }
      );
    }

    return tags.map(({ id, name }) => ({
      value: id,
      label: name ?? found.get(id) ?? placeholderName(id),
    }));
  };

  const validate = async (): Promise<boolean> => {
    if (formValue.trim().length === 0) {
      setErrors([intl.formatMessage(messages.valueRequired)]);
      return false;
    }

    const parsed = parseAdultTags(mediaType, formValue);

    if (parsed.errors.length > 0) {
      setErrors(parsed.errors.map(syntaxError));
      return false;
    }

    if (mediaType === 'scene') {
      const named = await nameStashDbTags(parsed.tags);

      if (named.errors.length > 0) {
        setErrors(named.errors);
        return false;
      }

      onImport(named.options);
    } else {
      onImport(await nameTpdbTags(parsed.tags));
    }

    setErrors([]);
    return true;
  };

  const onConfirm = async () => {
    setChecking(true);
    try {
      if (await validate()) {
        setShow(false);
        setFormValue('');
      }
    } finally {
      setChecking(false);
    }
  };

  return (
    <>
      <Transition
        as="div"
        enter="transition-opacity duration-300"
        enterFrom="opacity-0"
        enterTo="opacity-100"
        leave="transition-opacity duration-300"
        leaveFrom="opacity-100"
        leaveTo="opacity-0"
        show={show}
      >
        <Modal
          title={intl.formatMessage(messages.importTitle)}
          okText={intl.formatMessage(messages.confirm)}
          okDisabled={checking}
          onOk={onConfirm}
          onCancel={() => {
            setShow(false);
            setErrors([]);
          }}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onConfirm();
            }}
          >
            <div>
              <label htmlFor={`${mediaType}-tag-import`}>
                {intl.formatMessage(
                  mediaType === 'scene'
                    ? messages.importStashDbInstructions
                    : messages.importTpdbInstructions
                )}
              </label>
              <textarea
                id={`${mediaType}-tag-import`}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                className="h-20"
              />
              {errors.length > 0 && (
                <div className="error">
                  {errors.map((error) => (
                    <div key={error}>{error}</div>
                  ))}
                </div>
              )}
            </div>
          </form>
        </Modal>
      </Transition>

      <Tooltip
        content={intl.formatMessage(messages.importTagsTip)}
        tooltipConfig={{ followCursor: false }}
      >
        <button
          className="input-action"
          onClick={(event) => {
            event.stopPropagation();
            setShow(true);
          }}
          type="button"
        >
          <ArrowDownIcon />
        </button>
      </Tooltip>
    </>
  );
};

export default AdultBlocklistedTagsSelector;
