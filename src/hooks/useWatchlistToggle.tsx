import useToasts from '@app/hooks/useToasts';
import { isAdultMediaType } from '@app/utils/adultMedia';
import type { Watchlist } from '@server/entity/Watchlist';
import axios from 'axios';
import { useState } from 'react';
import type { MessageDescriptor } from 'react-intl';
import { useIntl } from 'react-intl';
import { mutate } from 'swr';

interface WatchlistToggleOptions {
  // TMDB id, or the StashDB or ThePornDB UUID of a scene or adult movie
  id: number | string;
  mediaType: string;
  title: string;
  onWatchlist: boolean;
  // Toasts in the caller's words
  messages: {
    added: MessageDescriptor;
    removed: MessageDescriptor;
    error: MessageDescriptor;
  };
  onRemoved?: () => void;
  // With the new entry, whose media shows a request the add made
  onAdded?: (watchlist: Watchlist) => void;
}

// Adds a title to the user's watchlist or takes it off again
const useWatchlistToggle = ({
  id,
  mediaType,
  title,
  onWatchlist: initialOnWatchlist,
  messages,
  onRemoved,
  onAdded,
}: WatchlistToggleOptions) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const [onWatchlist, setOnWatchlist] = useState(initialOnWatchlist);
  const [isUpdating, setIsUpdating] = useState(false);
  const strong = (msg: React.ReactNode) => <strong>{msg}</strong>;

  const showError = () =>
    addToast(intl.formatMessage(messages.error), {
      appearance: 'error',
      autoDismiss: true,
    });

  const add = async (): Promise<void> => {
    setIsUpdating(true);
    try {
      const response = await axios.post<Watchlist>(
        '/api/v1/watchlist',
        // Scenes and adult movies are named by their external id only
        isAdultMediaType(mediaType)
          ? { externalId: id, mediaType }
          : { tmdbId: id, mediaType, title }
      );
      mutate('/api/v1/discover/watchlist');
      if (response.data) {
        addToast(
          <span>{intl.formatMessage(messages.added, { title, strong })}</span>,
          { appearance: 'success', autoDismiss: true }
        );
      }
      setOnWatchlist(true);
      onAdded?.(response.data);
    } catch {
      showError();
    } finally {
      setIsUpdating(false);
    }
  };

  const remove = async (): Promise<void> => {
    setIsUpdating(true);
    try {
      const response = await axios.delete(
        `/api/v1/watchlist/${id}?mediaType=${mediaType}`
      );
      if (response.status === 204) {
        addToast(
          <span>
            {intl.formatMessage(messages.removed, { title, strong })}
          </span>,
          { appearance: 'info', autoDismiss: true }
        );
      }
      setOnWatchlist(false);
    } catch {
      showError();
    } finally {
      setIsUpdating(false);
      mutate('/api/v1/discover/watchlist');
      onRemoved?.();
    }
  };

  return {
    onWatchlist,
    isUpdating,
    add,
    remove,
    toggle: onWatchlist ? remove : add,
  };
};

export default useWatchlistToggle;
