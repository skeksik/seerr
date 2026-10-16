import useToasts from '@app/hooks/useToasts';
import { useUser } from '@app/hooks/useUser';
import globalMessages from '@app/i18n/globalMessages';
import { isAdultMediaType } from '@app/utils/adultMedia';
import { MediaStatus } from '@server/constants/media';
import axios from 'axios';
import { useState } from 'react';
import { useIntl } from 'react-intl';

interface BlocklistToggleOptions {
  // TMDB id, or the StashDB or ThePornDB UUID of a scene or adult movie
  id: number | string;
  mediaType: string;
  title: string;
  // Called with the title's new status
  onChange?: (status: MediaStatus) => void;
}

// Hides a title, or a collection's movies, from everyone, or shows it again
const useBlocklistToggle = ({
  id,
  mediaType,
  title,
  onChange,
}: BlocklistToggleOptions) => {
  const intl = useIntl();
  const { addToast } = useToasts();
  const { user } = useUser();
  const [isUpdating, setIsUpdating] = useState(false);
  const strong = (msg: React.ReactNode) => <strong>{msg}</strong>;

  const showError = () =>
    addToast(intl.formatMessage(globalMessages.blocklistError), {
      appearance: 'error',
      autoDismiss: true,
    });

  const blocklist = async (): Promise<void> => {
    setIsUpdating(true);
    try {
      if (mediaType === 'collection') {
        await axios.post(`/api/v1/blocklist/collection/${id}`);
      } else {
        await axios.post(
          '/api/v1/blocklist',
          isAdultMediaType(mediaType)
            ? { externalId: id, mediaType }
            : { tmdbId: id, mediaType, title, user: user?.id }
        );
      }
      addToast(
        <span>
          {intl.formatMessage(globalMessages.blocklistSuccess, {
            title,
            strong,
          })}
        </span>,
        { appearance: 'success', autoDismiss: true }
      );
      onChange?.(MediaStatus.BLOCKLISTED);
    } catch (e) {
      if (e?.response?.status === 412) {
        addToast(
          <span>
            {intl.formatMessage(globalMessages.blocklistDuplicateError, {
              title,
              strong,
            })}
          </span>,
          { appearance: 'info', autoDismiss: true }
        );
      } else {
        showError();
      }
    } finally {
      setIsUpdating(false);
    }
  };

  const unblocklist = async (): Promise<void> => {
    setIsUpdating(true);
    try {
      const res = await axios.delete(
        mediaType === 'collection'
          ? `/api/v1/blocklist/collection/${id}`
          : `/api/v1/blocklist/${id}?mediaType=${mediaType}`
      );

      if (res.status === 204) {
        addToast(
          <span>
            {intl.formatMessage(globalMessages.removeFromBlocklistSuccess, {
              title,
              strong,
            })}
          </span>,
          { appearance: 'success', autoDismiss: true }
        );
        onChange?.(MediaStatus.UNKNOWN);
      } else {
        showError();
      }
    } catch {
      showError();
    } finally {
      setIsUpdating(false);
    }
  };

  return { isUpdating, blocklist, unblocklist };
};

export default useBlocklistToggle;
