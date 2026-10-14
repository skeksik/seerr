import SceneCard from '@app/components/SceneCard';
import useVerticalScroll from '@app/hooks/useVerticalScroll';
import globalMessages from '@app/i18n/globalMessages';
import type { SceneResult } from '@server/models/Scene';
import { useIntl } from 'react-intl';

interface SceneListProps {
  scenes: SceneResult[];
  isEmpty: boolean;
  isLoading: boolean;
  isReachingEnd: boolean;
  onScrollBottom: () => void;
}

const SceneList = ({
  scenes,
  isEmpty,
  isLoading,
  isReachingEnd,
  onScrollBottom,
}: SceneListProps) => {
  const intl = useIntl();
  useVerticalScroll(onScrollBottom, !isLoading && !isEmpty && !isReachingEnd);

  return (
    <>
      {isEmpty && (
        <div className="mt-64 w-full text-center text-2xl text-gray-400">
          {intl.formatMessage(globalMessages.noresults)}
        </div>
      )}
      <ul className="cards-horizontal">
        {scenes.map((scene) => (
          <li key={scene.id}>
            <SceneCard scene={scene} canExpand />
          </li>
        ))}
        {isLoading &&
          !isReachingEnd &&
          [...Array(20)].map((_item, i) => (
            <li key={`placeholder-${i}`}>
              <SceneCard.Placeholder canExpand />
            </li>
          ))}
      </ul>
    </>
  );
};

export default SceneList;
