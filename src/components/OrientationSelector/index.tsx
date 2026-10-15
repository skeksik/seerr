import defineMessages from '@app/utils/defineMessages';
import type { Orientation } from '@server/lib/orientation';
import { ORIENTATIONS } from '@server/lib/orientation';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.OrientationSelector', {
  straight: 'Straight',
  lesbian: 'Lesbian',
  bisexual: 'Bisexual',
  gay: 'Gay',
  trans: 'Trans',
  futa: 'Futa',
});

interface OrientationSelectorProps {
  selected: Orientation[];
  // Disabled sexual preferences are left out
  options?: Orientation[];
  onChange: (selected: Orientation[]) => void;
}

// Sexual preference toggles, like the Content Rating filter
const OrientationSelector = ({
  selected,
  options = [...ORIENTATIONS],
  onChange,
}: OrientationSelectorProps) => {
  const intl = useIntl();

  return (
    <div className="flex flex-wrap gap-2">
      {options.map((orientation) => {
        const isSelected = selected.includes(orientation);
        return (
          <button
            key={orientation}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onChange(
                ORIENTATIONS.filter((value) =>
                  value === orientation ? !isSelected : selected.includes(value)
                )
              )
            }
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              isSelected
                ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                : 'bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-gray-700 dark:text-gray-200 dark:hover:bg-gray-600'
            }`}
          >
            {intl.formatMessage(messages[orientation])}
          </button>
        );
      })}
    </div>
  );
};

export default OrientationSelector;
