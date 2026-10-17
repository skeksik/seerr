import CachedImage from '@app/components/Common/CachedImage';
import Link from 'next/link';
import { useState } from 'react';

interface CompanyCardProps {
  name: string;
  image?: string;
  url: string;
  // Adult studio logos come from StashDB
  imageType?: 'tmdb' | 'stashdb';
  // Takes the width of its grid cell instead of a fixed one
  fullWidth?: boolean;
}

const CompanyCard = ({
  image,
  url,
  name,
  imageType = 'tmdb',
  fullWidth = false,
}: CompanyCardProps) => {
  const [isHovered, setHovered] = useState(false);

  return (
    <Link
      href={url}
      className={`relative flex h-32 transform-gpu cursor-pointer items-center justify-center p-8 shadow ring-1 transition duration-300 ease-in-out sm:h-36 ${
        fullWidth ? 'w-full' : 'w-56 sm:w-72'
      } ${
        isHovered
          ? 'scale-105 bg-gray-700 ring-gray-500'
          : 'scale-100 bg-gray-800 ring-gray-700'
      } rounded-xl`}
      onMouseEnter={() => {
        setHovered(true);
      }}
      // A card that loads under the cursor gets no mouseenter
      onMouseMove={() => {
        if (!isHovered) {
          setHovered(true);
        }
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
      <div className="relative h-full w-full">
        {image ? (
          <CachedImage
            type={imageType}
            src={image}
            alt={name}
            className="relative z-40 h-full w-full"
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            fill
          />
        ) : (
          <div className="relative z-40 flex h-full w-full items-center justify-center overflow-hidden text-center text-xl font-bold text-gray-200">
            {/* Sliders keep their items on one line; long names wrap here */}
            <span className="line-clamp-3 whitespace-normal break-words">
              {name}
            </span>
          </div>
        )}
      </div>
      <div
        className={`absolute bottom-0 left-0 right-0 z-0 h-12 rounded-b-xl bg-gradient-to-t ${
          isHovered ? 'from-gray-800' : 'from-gray-900'
        }`}
      />
    </Link>
  );
};

export default CompanyCard;
