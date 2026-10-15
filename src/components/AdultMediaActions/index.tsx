import Spinner from '@app/assets/spinner.svg';
import BlocklistModal from '@app/components/BlocklistModal';
import Button from '@app/components/Common/Button';
import Tooltip from '@app/components/Common/Tooltip';
import useToasts from '@app/hooks/useToasts';
import { Permission, UserType, useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import defineMessages from '@app/utils/defineMessages';
import {
  EyeIcon,
  EyeSlashIcon,
  MinusCircleIcon,
} from '@heroicons/react/24/outline';
import { StarIcon } from '@heroicons/react/24/solid';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

const messages = defineMessages('components.AdultMediaActions', {
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
  const { addToast } = useToasts();
  const { user, hasPermission } = useUser();
  const [onWatchlist, setOnWatchlist] = useState(onUserWatchlist);
  const [isUpdating, setIsUpdating] = useState(false);
  const [showBlocklistModal, setShowBlocklistModal] = useState(false);
  const [isBlocklistUpdating, setIsBlocklistUpdating] = useState(false);
  const canBlocklist = hasPermission(Permission.MANAGE_BLOCKLIST);
  const strong = (msg: React.ReactNode) => <strong>{msg}</strong>;

  const toggleWatchlist = async () => {
    setIsUpdating(true);

    try {
      if (onWatchlist) {
        await axios.delete(`/api/v1/watchlist/${id}?mediaType=${mediaType}`);
      } else {
        await axios.post('/api/v1/watchlist', { mediaType, externalId: id });
      }

      addToast(
        <span>
          {intl.formatMessage(
            onWatchlist ? messages.watchlistDeleted : messages.watchlistSuccess,
            { title, strong }
          )}
        </span>,
        { appearance: onWatchlist ? 'info' : 'success', autoDismiss: true }
      );
      setOnWatchlist(!onWatchlist);
      mutate('/api/v1/discover/watchlist');
    } catch {
      addToast(intl.formatMessage(messages.watchlistError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsUpdating(false);
    }
  };

  const blocklist = async () => {
    setIsBlocklistUpdating(true);

    try {
      await axios.post('/api/v1/blocklist', { mediaType, externalId: id });
      addToast(
        <span>
          {intl.formatMessage(globalMessages.blocklistSuccess, {
            title,
            strong,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      onChange();
    } catch (e) {
      addToast(
        e?.response?.status === 412 ? (
          <span>
            {intl.formatMessage(globalMessages.blocklistDuplicateError, {
              title,
              strong,
            })}
          </span>
        ) : (
          intl.formatMessage(globalMessages.blocklistError)
        ),
        {
          appearance: e?.response?.status === 412 ? 'info' : 'error',
          autoDismiss: true,
        }
      );
    } finally {
      setIsBlocklistUpdating(false);
      setShowBlocklistModal(false);
    }
  };

  const unblocklist = async () => {
    setIsBlocklistUpdating(true);

    try {
      await axios.delete(`/api/v1/blocklist/${id}?mediaType=${mediaType}`);
      addToast(
        <span>
          {intl.formatMessage(globalMessages.removeFromBlocklistSuccess, {
            title,
            strong,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      onChange();
    } catch {
      addToast(intl.formatMessage(globalMessages.blocklistError), {
        appearance: 'error',
        autoDismiss: true,
      });
    } finally {
      setIsBlocklistUpdating(false);
    }
  };

  if (status === MediaStatus.BLOCKLISTED) {
    return canBlocklist ? (
      <Tooltip content={intl.formatMessage(globalMessages.removefromBlocklist)}>
        <Button
          buttonType="ghost"
          className="z-40"
          disabled={isBlocklistUpdating}
          onClick={unblocklist}
        >
          <EyeIcon />
        </Button>
      </Tooltip>
    ) : null;
  }

  return (
    <>
      <BlocklistModal
        tmdbId={id}
        type={mediaType}
        show={showBlocklistModal}
        onCancel={() => setShowBlocklistModal(false)}
        onComplete={blocklist}
        isUpdating={isBlocklistUpdating}
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
            onWatchlist ? messages.removefromwatchlist : messages.addtowatchlist
          )}
        >
          <Button
            buttonType={onWatchlist ? 'default' : 'ghost'}
            className="z-40"
            disabled={isUpdating}
            onClick={toggleWatchlist}
          >
            {isUpdating ? (
              <Spinner />
            ) : onWatchlist ? (
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
