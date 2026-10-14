import { useAdultBlur } from '@app/hooks/useAdult';
import useSettings from '@app/hooks/useSettings';
import type { ImageLoader, ImageProps } from 'next/image';
import Image from 'next/image';

const imageLoader: ImageLoader = ({ src }) => src;

export type CachedImageProps = ImageProps & {
  src: string;
  type: 'tmdb' | 'avatar' | 'tvdb' | 'stashdb' | 'tpdb';
  // Adult TMDB artwork; StashDB and ThePornDB images always count as adult
  adult?: boolean;
};

/**
 * The CachedImage component should be used wherever
 * we want to offer the option to locally cache images.
 **/
const CachedImage = ({
  src,
  type,
  adult = false,
  className,
  ...props
}: CachedImageProps) => {
  const { currentSettings } = useSettings();
  const blurAdult = useAdultBlur();
  const blur = blurAdult && (adult || type === 'stashdb' || type === 'tpdb');

  let imageUrl: string;

  if (type === 'tmdb') {
    // tmdb stuff
    imageUrl =
      currentSettings.cacheImages && !src.startsWith('/')
        ? src.replace(/^https:\/\/image\.tmdb\.org\//, '/imageproxy/tmdb/')
        : src;
  } else if (type === 'tvdb') {
    imageUrl =
      currentSettings.cacheImages && !src.startsWith('/')
        ? src.replace(
            /^https:\/\/artworks\.thetvdb\.com\//,
            '/imageproxy/tvdb/'
          )
        : src;
  } else if (type === 'stashdb') {
    imageUrl =
      currentSettings.cacheImages && !src.startsWith('/')
        ? src.replace(
            /^https?:\/\/[^/]+\/images\//,
            '/imageproxy/stashdb/images/'
          )
        : src;
  } else if (type === 'tpdb') {
    imageUrl =
      currentSettings.cacheImages && !src.startsWith('/')
        ? src.replace(/^https:\/\/cdn\.theporndb\.net\//, '/imageproxy/tpdb/')
        : src;
  } else if (type === 'avatar') {
    // jellyfin avatar (if any)
    imageUrl = src;
  } else {
    return null;
  }

  return (
    <Image
      unoptimized
      loader={imageLoader}
      src={imageUrl}
      className={blur ? `adult-blur ${className ?? ''}` : className}
      {...props}
    />
  );
};

export default CachedImage;
