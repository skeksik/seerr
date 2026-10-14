import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import globalMessages from '@app/i18n/globalMessages';
import { stashImageUrl } from '@app/utils/stashImage';
import { withProperties } from '@app/utils/typeHelpers';
import { MediaStatus } from '@server/constants/media';
import type { SceneResult } from '@server/models/Scene';
import Link from 'next/link';
import { useIntl } from 'react-intl';

interface SceneCardProps {
  scene: SceneResult;
  canExpand?: boolean;
}

// Scene covers are 16:9 stills, so these cards are landscape unlike TitleCard
const SceneCard = ({ scene, canExpand = false }: SceneCardProps) => {
  const intl = useIntl();
  const status = scene.mediaInfo?.status;
  const imageUrl = stashImageUrl(scene.imageUrl, 600);

  return (
    <div
      className={canExpand ? 'w-full' : 'w-64 sm:w-72'}
      data-testid="scene-card"
    >
      <Link
        href={`/scene/${scene.id}`}
        className="group relative block transform-gpu overflow-hidden rounded-xl bg-gray-800 shadow outline-none ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:shadow-lg hover:ring-gray-500 focus-visible:ring-gray-500"
        style={{ paddingBottom: '56.25%' }}
      >
        {imageUrl && (
          <CachedImage
            type="stashdb"
            className="absolute inset-0 h-full w-full"
            alt=""
            src={imageUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
        )}
        <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-2">
          <div className="pointer-events-none z-10 rounded-full border border-pink-500 bg-pink-600/80 shadow-md">
            <div className="flex h-4 items-center px-2 py-2 text-xs font-medium uppercase tracking-wider text-white sm:h-5">
              {intl.formatMessage(globalMessages.scene)}
            </div>
          </div>
          {status && status !== MediaStatus.UNKNOWN && (
            <div className="pointer-events-none z-10">
              <StatusBadgeMini
                status={status}
                inProgress={(scene.mediaInfo?.downloadStatus ?? []).length > 0}
                shrink
              />
            </div>
          )}
        </div>
        <div
          className="absolute inset-x-0 bottom-0 px-3 pb-2 pt-8 text-white"
          style={{
            background:
              'linear-gradient(180deg, rgba(17, 24, 39, 0) 0%, rgba(17, 24, 39, 0.95) 100%)',
          }}
        >
          <div className="truncate text-xs text-gray-300">
            {[scene.studio?.name, scene.releaseDate?.slice(0, 4)]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <h1
            className="whitespace-normal text-sm font-bold leading-tight"
            style={{
              WebkitLineClamp: 2,
              display: '-webkit-box',
              overflow: 'hidden',
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
            }}
            data-testid="scene-card-title"
          >
            {scene.title}
          </h1>
        </div>
      </Link>
    </div>
  );
};

const Placeholder = ({ canExpand = false }: { canExpand?: boolean }) => (
  <div
    className={`relative animate-pulse rounded-xl bg-gray-700 ${
      canExpand ? 'w-full' : 'w-64 sm:w-72'
    }`}
  >
    <div className="w-full" style={{ paddingBottom: '56.25%' }} />
  </div>
);

export default withProperties(SceneCard, { Placeholder });
