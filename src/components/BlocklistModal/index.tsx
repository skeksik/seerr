import Modal from '@app/components/Common/Modal';
import globalMessages from '@app/i18n/globalMessages';
import { isAdultMediaType, mediaTypeMessage } from '@app/utils/adultMedia';
import defineMessages from '@app/utils/defineMessages';
import { adultArtwork } from '@app/utils/stashImage';
import { Transition } from '@headlessui/react';

import type { AdultMovieDetails } from '@server/models/AdultMovie';
import type { Collection } from '@server/models/Collection';
import type { MovieDetails } from '@server/models/Movie';
import type { SceneDetails } from '@server/models/Scene';
import type { TvDetails } from '@server/models/Tv';
import { useIntl } from 'react-intl';
import useSWR from 'swr';

interface BlocklistModalProps {
  // TMDB id, or the StashDB or ThePornDB UUID of a scene or adult movie
  id?: number | string;
  // Old name of id, still used by MovieDetails and CollectionDetails
  tmdbId?: number;
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

const BlocklistModal = ({
  id,
  tmdbId,
  type,
  show,
  onComplete,
  onCancel,
  isUpdating,
}: BlocklistModalProps) => {
  const intl = useIntl();
  const itemId = id ?? tmdbId;
  const { data, error } = useSWR<BlocklistTitle>(
    show && itemId !== undefined ? `/api/v1/${type}/${itemId}` : null
  );
  const artwork =
    data && isAdultMediaType(type)
      ? adultArtwork(data as SceneDetails | AdultMovieDetails)
      : undefined;

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
        title={`${intl.formatMessage(
          globalMessages.blocklist
        )} ${intl.formatMessage(mediaTypeMessage(type))}`}
        subTitle={`${data && 'title' in data ? data.title : data?.name}`}
        onCancel={onCancel}
        onOk={onComplete}
        okText={
          isUpdating
            ? intl.formatMessage(messages.blocklisting)
            : intl.formatMessage(globalMessages.blocklist)
        }
        okButtonType="danger"
        okDisabled={isUpdating}
        {...(artwork
          ? { backdrop: artwork.backdrop, backdropType: artwork.imageType }
          : {
              backdrop: `https://image.tmdb.org/t/p/w1920_and_h800_multi_faces/${
                (data as MovieDetails | undefined)?.backdropPath
              }`,
            })}
      />
    </Transition>
  );
};

export default BlocklistModal;
