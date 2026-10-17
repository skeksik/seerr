import { VerifyClearIndicator } from '@app/components/BlocklistedTagsSelector';
import defineMessages from '@app/utils/defineMessages';
import axios from 'axios';
import { useFormikContext } from 'formik';
import { useIntl } from 'react-intl';
import type { MultiValue } from 'react-select';
import AsyncSelect from 'react-select/async';

const messages = defineMessages('components.AdultBlocklistedTagsSelector', {
  searchStashDbTags: 'Search StashDB tags…',
  searchTpdbTags: 'Search ThePornDB tags…',
  starttyping: 'Start typing to search.',
  nooptions: 'No results.',
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

interface AdultBlocklistedTagsSelectorProps {
  mediaType: keyof typeof fields;
}

// BlocklistedTagsSelector for StashDB tags of scenes and ThePornDB tags of
// adult movies
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

  const update = (options: MultiValue<Option> | null) => {
    setFieldValue(field.ids, (options ?? []).map((o) => o.value).join(','));
    setFieldValue(
      field.names,
      // | separates the names
      (options ?? []).map((o) => o.label.replace(/\|/g, '/')).join('|')
    );
  };

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

  return (
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
  );
};

export default AdultBlocklistedTagsSelector;
