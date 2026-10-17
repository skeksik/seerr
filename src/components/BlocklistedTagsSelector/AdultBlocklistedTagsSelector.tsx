import { VerifyClearIndicator } from '@app/components/BlocklistedTagsSelector';
import Modal from '@app/components/Common/Modal';
import Tooltip from '@app/components/Common/Tooltip';
import CopyButton from '@app/components/Settings/CopyButton';
import type { AdultTagKind, AdultTagListError } from '@app/utils/adultTagList';
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
  searchTags: 'Search tags…',
  starttyping: 'Start typing to search.',
  nooptions: 'No results.',
  copyTags: 'Copied blocklisted tags to clipboard.',
  copyTagsTip: 'Copy blocklisted tag configuration',
  copyTagsEmpty: 'Nothing to copy',
  importTagsTip: 'Import blocklisted tag configuration',
  importTitle: 'Import Blocklisted Tag Configuration',
  importInstructions: 'Paste blocklist tag configuration below.',
  confirm: 'Confirm',
  valueRequired: 'You must provide a value.',
  emptyEntry:
    'Tags must be separated by single commas, and the configuration must not start or end with a comma.',
  invalidStashDbId: '{entry} is not a StashDB tag id.',
  notStashDbTag: '{tagId} is not a StashDB tag.',
  stashDbLookupFailed: 'Could not look up StashDB tag {tagId}.',
  notTpdbTag: '{name} is not a ThePornDB tag.',
  tpdbLookupFailed: 'Could not look up ThePornDB tag {name}.',
});

type Option = { label: string; value: string };

// The settings each kind keeps its tags in: ids, and their names, which
// ThePornDB cannot look up by id
const fields = {
  scene: {
    ids: 'blocklistedSceneTags',
    names: 'blocklistedSceneTagNames',
    searchUrl: '/api/v1/scene/lookup/tags',
  },
  adultmovie: {
    ids: 'blocklistedAdultMovieTags',
    names: 'blocklistedAdultMovieTagNames',
    searchUrl: '/api/v1/adultmovie/tags',
  },
} as const;

interface AdultBlocklistedTagsSelectorProps {
  mediaType: AdultTagKind;
}

// BlocklistedTagsSelector for StashDB tags of scenes and ThePornDB tags of
// adult movies, with its copy and import buttons. They copy StashDB tag ids
// and ThePornDB tag names, as ThePornDB looks tags up by name only
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
        placeholder={intl.formatMessage(messages.searchTags)}
        onChange={update}
        components={{
          DropdownIndicator: undefined,
          IndicatorSeparator: undefined,
          ClearIndicator: VerifyClearIndicator,
        }}
      />
      <CopyButton
        textToCopy={formatAdultTags(
          mediaType,
          selected.map(({ value, label }) => ({ id: value, name: label }))
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

class TagNotFound extends Error {}

// Each entry's tag, or why it has none
const lookUp = async (
  entries: string[],
  find: (entry: string) => Promise<Option>,
  error: (entry: string, notFound: boolean) => string
): Promise<{ options: Option[]; errors: string[] }> => {
  const results = await Promise.allSettled(entries.map(find));
  const options: Option[] = [];
  const errors: string[] = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      options.push(result.value);
    } else {
      errors.push(
        error(
          entries[index],
          result.reason instanceof TagNotFound ||
            result.reason?.response?.status === 404
        )
      );
    }
  });

  return { options, errors };
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
  const [show, setShow] = useState(false);
  const [formValue, setFormValue] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [checking, setChecking] = useState(false);

  const syntaxError = (error: AdultTagListError): string => {
    switch (error.type) {
      case 'emptyEntry':
        return intl.formatMessage(messages.emptyEntry);
      case 'invalidId':
        return intl.formatMessage(messages.invalidStashDbId, {
          entry: error.entry,
        });
    }
  };

  // StashDB names every tag by id, so each is checked and named by it
  const nameStashDbTags = (ids: string[]) =>
    lookUp(
      ids,
      async (id) => {
        const { data } = await axios.get<{ id: string; name: string }>(
          `/api/v1/scene/tag/${id}`
        );
        return { value: id, label: data.name };
      },
      (id, notFound) =>
        intl.formatMessage(
          notFound ? messages.notStashDbTag : messages.stashDbLookupFailed,
          { tagId: id }
        )
    );

  // ThePornDB finds tags by name, so each is searched for and taken from the
  // results by its whole name
  const nameTpdbTags = (names: string[]) =>
    lookUp(
      names,
      async (name) => {
        const { data } = await axios.get<{ id: number; name: string }[]>(
          '/api/v1/adultmovie/tags',
          { params: { query: name } }
        );
        const tag = data.find(
          (result) => result.name.toLowerCase() === name.toLowerCase()
        );

        if (!tag) {
          throw new TagNotFound();
        }

        return { value: String(tag.id), label: tag.name };
      },
      (name, notFound) =>
        intl.formatMessage(
          notFound ? messages.notTpdbTag : messages.tpdbLookupFailed,
          { name }
        )
    );

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

    const named = await (mediaType === 'scene'
      ? nameStashDbTags(parsed.entries)
      : nameTpdbTags(parsed.entries));

    if (named.errors.length > 0) {
      setErrors(named.errors);
      return false;
    }

    // Two ThePornDB names can find one tag
    onImport(
      named.options.filter(
        (option, index, options) =>
          options.findIndex((other) => other.value === option.value) === index
      )
    );
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
                {intl.formatMessage(messages.importInstructions)}
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
