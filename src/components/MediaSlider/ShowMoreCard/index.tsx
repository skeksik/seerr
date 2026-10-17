import CachedImage from '@app/components/Common/CachedImage';
import TitleCard from '@app/components/TitleCard';
import { LANDSCAPE_CARD_WIDTH } from '@app/components/TitleCard/constants';
import defineMessages from '@app/utils/defineMessages';
import { ArrowRightCircleIcon } from '@heroicons/react/24/solid';
import Link from 'next/link';
import { useState } from 'react';
import { useInView } from 'react-intersection-observer';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.MediaSlider.ShowMoreCard', {
  seemore: 'See More',
});

interface ShowMoreCardProps {
  url: string;
  // TMDB poster paths, or full image URLs for the other image types
  posters: (string | undefined)[];
  imageType?: 'tmdb' | 'stashdb' | 'tpdb';
  // Sized like a scene card instead of a poster
  landscape?: boolean;
}

const ShowMoreCard = ({
  url,
  posters,
  imageType = 'tmdb',
  landscape = false,
}: ShowMoreCardProps) => {
  const width = landscape ? LANDSCAPE_CARD_WIDTH : 'w-36 sm:w-36 md:w-44';
  const intl = useIntl();
  const [isHovered, setHovered] = useState(false);
  const { ref, inView } = useInView({
    triggerOnce: true,
  });

  if (!inView) {
    return (
      <div ref={ref}>
        <TitleCard.Placeholder landscape={landscape} />
      </div>
    );
  }

  return (
    <Link
      href={url}
      className={width}
      onMouseEnter={() => {
        setHovered(true);
      }}
      onMouseLeave={() => setHovered(false)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          setHovered(true);
        }
      }}
      role="link"
      tabIndex={0}
    >
      <div
        className={`relative ${width} transform-gpu cursor-pointer overflow-hidden rounded-xl text-white shadow-lg ring-1 transition duration-150 ease-in-out ${
          isHovered
            ? 'scale-105 bg-gray-600 ring-gray-500'
            : 'scale-100 bg-gray-800 ring-gray-700'
        }`}
      >
        <div style={{ paddingBottom: landscape ? '56.25%' : '150%' }}>
          <div className="absolute inset-0 flex h-full w-full flex-col items-center p-2">
            <div className="relative z-10 grid h-full w-full grid-cols-2 items-center justify-center gap-2 opacity-30">
              {posters.slice(0, 4).map(
                (poster, i) =>
                  poster && (
                    <div
                      key={`show-more-${i}`}
                      className="relative overflow-hidden rounded-md"
                      style={{ aspectRatio: landscape ? '16 / 9' : '2 / 3' }}
                    >
                      <CachedImage
                        type={imageType}
                        src={
                          imageType === 'tmdb'
                            ? `https://image.tmdb.org/t/p/w300_and_h450_face${poster}`
                            : poster
                        }
                        alt=""
                        style={{
                          width: '100%',
                          height: '100%',
                          objectFit: 'cover',
                        }}
                        fill
                      />
                    </div>
                  )
              )}
            </div>
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center text-white">
              <ArrowRightCircleIcon className="w-14" />
              <div className="mt-2 font-extrabold">
                {intl.formatMessage(messages.seemore)}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Link>
  );
};

export default ShowMoreCard;
