import CachedImage from '@app/components/Common/CachedImage';
import StatusBadgeMini from '@app/components/Common/StatusBadgeMini';
import globalMessages from '@app/i18n/globalMessages';
import { withProperties } from '@app/utils/typeHelpers';
import { MediaStatus } from '@server/constants/media';
import type { XxxMovieResult } from '@server/models/XxxMovie';
import Link from 'next/link';
import { useIntl } from 'react-intl';

interface XxxMovieCardProps {
  movie: XxxMovieResult;
  canExpand?: boolean;
}

// ThePornDB movies have portrait covers, so these match TitleCard's shape
const XxxMovieCard = ({ movie, canExpand = false }: XxxMovieCardProps) => {
  const intl = useIntl();
  const status = movie.mediaInfo?.status;

  return (
    <div
      className={canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'}
      data-testid="xxx-movie-card"
    >
      <Link
        href={`/xxxmovie/${movie.id}`}
        className="group relative block transform-gpu overflow-hidden rounded-xl bg-gray-800 bg-cover shadow outline-none ring-1 ring-gray-700 transition duration-300 hover:scale-105 hover:shadow-lg hover:ring-gray-500 focus-visible:ring-gray-500"
        style={{ paddingBottom: '150%' }}
      >
        {movie.posterUrl ? (
          <CachedImage
            type="tpdb"
            className="absolute inset-0 h-full w-full"
            alt=""
            src={movie.posterUrl}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            fill
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center p-3 text-center text-sm text-gray-400">
            {movie.title}
          </div>
        )}
        <div className="absolute left-0 right-0 top-0 flex items-start justify-between p-2">
          <div className="pointer-events-none z-10 rounded-full border border-pink-500 bg-pink-600/80 shadow-md">
            <div className="flex h-4 items-center px-2 py-2 text-xs font-medium uppercase tracking-wider text-white sm:h-5">
              {intl.formatMessage(globalMessages.xxx)}
            </div>
          </div>
          {status && status !== MediaStatus.UNKNOWN && (
            <div className="pointer-events-none z-10">
              <StatusBadgeMini
                status={status}
                inProgress={(movie.mediaInfo?.downloadStatus ?? []).length > 0}
                shrink
              />
            </div>
          )}
        </div>
        <div
          className="absolute inset-x-0 bottom-0 px-2 pb-2 pt-10 text-white opacity-0 transition duration-300 group-hover:opacity-100 group-focus-visible:opacity-100"
          style={{
            background:
              'linear-gradient(180deg, rgba(17, 24, 39, 0) 0%, rgba(17, 24, 39, 0.95) 100%)',
          }}
        >
          <div className="truncate text-xs text-gray-300">
            {[movie.studio?.name, movie.releaseDate?.slice(0, 4)]
              .filter(Boolean)
              .join(' · ')}
          </div>
          <h1
            className="whitespace-normal text-sm font-bold leading-tight"
            style={{
              WebkitLineClamp: 3,
              display: '-webkit-box',
              overflow: 'hidden',
              WebkitBoxOrient: 'vertical',
              wordBreak: 'break-word',
            }}
            data-testid="xxx-movie-card-title"
          >
            {movie.title}
          </h1>
        </div>
      </Link>
    </div>
  );
};

const Placeholder = ({ canExpand = false }: { canExpand?: boolean }) => (
  <div
    className={`relative animate-pulse rounded-xl bg-gray-700 ${
      canExpand ? 'w-full' : 'w-36 sm:w-36 md:w-44'
    }`}
  >
    <div className="w-full" style={{ paddingBottom: '150%' }} />
  </div>
);

export default withProperties(XxxMovieCard, { Placeholder });
