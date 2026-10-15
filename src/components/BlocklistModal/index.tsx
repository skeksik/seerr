import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import { Transition } from '@headlessui/react';

import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { Collection } from '@server/models/Collection';
import type { MovieDetails } from '@server/models/Movie';
import type { SceneDetails } from '@server/models/Scene';
import type { TvDetails } from '@server/models/Tv';
import axios from 'axios';
import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

interface BlocklistModalProps {
  // TMDB id, or the StashDB or ThePornDB UUID of a scene or adult movie
  tmdbId: number | string;
  type: 'movie' | 'tv' | 'collection' | 'scene' | 'adultmovie';
  show: boolean;
  onComplete?: () => void;
  onCancel?: () => void;
  isUpdating?: boolean;
}

const messages = defineMessages('component.BlocklistModal', {
  blocklisting: 'Blocklisting',
});

type BlocklistTitle =
  | MovieDetails
  | TvDetails
  | Collection
  | SceneDetails
  | AdultMovieDetails;

const isCollection = (data: BlocklistTitle | null): data is Collection => {
  return (
    data !== null &&
    data !== undefined &&
    (data as Collection).parts !== undefined
  );
};

const isMovie = (movie: BlocklistTitle | null): movie is MovieDetails => {
  if (!movie) return false;
  return (movie as MovieDetails).title !== undefined;
};

const backdropProps = (
  type: BlocklistModalProps['type'],
  data: BlocklistTitle | null
): { backdrop?: string; backdropType?: 'tmdb' | 'stashdb' | 'tpdb' } => {
  if (type === 'scene') {
    const imageUrl = (data as SceneDetails | null)?.imageUrl;
    return {
      backdrop: imageUrl ? `${imageUrl}?size=1280` : undefined,
      backdropType: 'stashdb',
    };
  }

  if (type === 'adultmovie') {
    const movie = data as AdultMovieDetails | null;
    return {
      backdrop: movie?.backdropUrl ?? movie?.posterUrl,
      backdropType: 'tpdb',
    };
  }

  return {
    backdrop: `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${
      (data as MovieDetails | null)?.backdropPath
    }`,
  };
};

const BlocklistModal = ({
  tmdbId,
  type,
  show,
  onComplete,
  onCancel,
  isUpdating,
}: BlocklistModalProps) => {
  const intl = useIntl();
  const [data, setData] = useState<BlocklistTitle | null>(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      if (!show) return;
      try {
        setError(null);
        const response = await axios.get(`/api/v1/${type}/${tmdbId}`);
        setData(response.data);
      } catch (err) {
        setError(err);
      }
    })();
  }, [show, tmdbId, type]);

  return (
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
        loading={!data && !error}
        backgroundClickable
        title={`${intl.formatMessage(globalMessages.blocklist)} ${
          type === 'collection'
            ? intl.formatMessage(globalMessages.collection)
            : type === 'scene'
              ? intl.formatMessage(globalMessages.scene)
              : type === 'adultmovie'
                ? intl.formatMessage(globalMessages.adultMovie)
                : isMovie(data)
                  ? intl.formatMessage(globalMessages.movie)
                  : intl.formatMessage(globalMessages.tvshow)
        }`}
        subTitle={`${
          isCollection(data)
            ? data.name
            : data && 'title' in data
              ? data.title
              : (data as TvDetails | null)?.name
        }`}
        onCancel={onCancel}
        onOk={onComplete}
        okText={
          isUpdating
            ? intl.formatMessage(messages.blocklisting)
            : intl.formatMessage(globalMessages.blocklist)
        }
        okButtonType="danger"
        okDisabled={isUpdating}
        {...backdropProps(type, data)}
      />
    </Transition>
  );
};

export default BlocklistModal;
