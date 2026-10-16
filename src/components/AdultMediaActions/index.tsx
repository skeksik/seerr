import Spinner from '@app/assets/spinner.svg';
import BlocklistModal from '@app/components/BlocklistModal';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useBlocklistToggle from '@app/hooks/useBlocklistToggle';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import useWatchlistToggle from '@app/hooks/useWatchlistToggle';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  EyeIcon,
  EyeSlashIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import { useState } from 'react';
import { useIntl } from 'react-intl';

// The movie page's texts, under its ids
const messages = defineMessages('components.MovieDetails', {
  watchlistSuccess: '<strong>{title}</strong> added to watchlist successfully!',
  watchlistDeleted:
    '<strong>{title}</strong> Removed from watchlist successfully!',
  watchlistError: 'Something went wrong. Please try again.',
  removefromwatchlist: 'Remove From Watchlist',
  addtowatchlist: 'Add To Watchlist',
});

interface AdultMediaActionsProps {
  mediaType: 'scene' | 'adultmovie';
  // StashDB scene or ThePornDB movie UUID
  id: string;
  title: string;
  status?: MediaStatus;
  onUserWatchlist?: boolean;
  onChange: () => void;
}

// Blocklist and watchlist buttons of the movie page, for scenes and adult movies
const AdultMediaActions = ({
  mediaType,
  id,
  title,
  status,
  onUserWatchlist = false,
  onChange,
}: AdultMediaActionsProps) => {
  const intl = useIntl();
  const { user, hasPermission } = useUser();
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const canBlocklist = hasPermission(Permission.MANAGE_BLOCKLIST);
  const watchlist = useWatchlistToggle({
    id,
    mediaType,
    title,
    onWatchlist: onUserWatchlist,
    messages: {
      added: messages.watchlistSuccess,
      removed: messages.watchlistDeleted,
      error: messages.watchlistError,
    },
  });
  const blocklist = useBlocklistToggle({
    id,
    mediaType,
    title,
    onChange: () => onChange(),
  });

  const blocklistTitle = async () => {
    await blocklist.blocklist();
    setShowBlocklistModal(false);
  };

  if (status === MediaStatus.BLOCKLISTED) {
    return canBlocklist ? (
      <Tooltip content={intl.formatMessage(globalMessages.removefromBlocklist)}>
        <Button
          buttonType="ghost"
          className="z-40"
          disabled={blocklist.isUpdating}
          onClick={blocklist.unblocklist}
        >
          <EyeIcon />
        </Button>
      </Tooltip>
    ) : null;
  }

  return (
    <>
      <BlocklistModal
        id={id}
        type={mediaType}
        show={showBlocklistModal}
        onCancel={() => setShowBlocklistModal(false)}
        onComplete={blocklistTitle}
        isUpdating={blocklist.isUpdating}
      />
      {canBlocklist &&
        (!status ||
          status === MediaStatus.UNKNOWN ||
          status === MediaStatus.DELETED) && (
          <Tooltip content={intl.formatMessage(globalMessages.addToBlocklist)}>
            <Button
              buttonType="ghost"
              className="z-40"
              onClick={() => setShowBlocklistModal(true)}
            >
              <EyeSlashIcon />
            </Button>
          </Tooltip>
        )}
      {user?.userType !== UserType.PLEX && (
        <Tooltip
          content={intl.formatMessage(
            watchlist.onWatchlist
              ? messages.removefromwatchlist
              : messages.addtowatchlist
          )}
        >
          <Button
            buttonType={watchlist.onWatchlist ? 'default' : 'ghost'}
            className="z-40"
            disabled={watchlist.isUpdating}
            onClick={watchlist.toggle}
          >
            {watchlist.isUpdating ? (
              <Spinner />
            ) : watchlist.onWatchlist ? (
              <MinusCircleIcon />
            ) : (
              <StarIcon className="text-amber-300" />
            )}
          </Button>
        </Tooltip>
      )}
    </>
  );
};

export default AdultMediaActions;
