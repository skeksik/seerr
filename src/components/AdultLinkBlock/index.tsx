import StashLogo from '@app/assets/services/stash.svg';
import TpdbLogo from '@app/assets/services/tpdb.svg';
import defineMessages from '@app/utils/defineMessages';
import { GlobeAltIcon } from '@heroicons/react/24/outline';
import { useIntl } from 'react-intl';

const messages = defineMessages('components.AdultLinkBlock', {
  studioSite: 'Studio Site',
});

interface AdultLinkBlockProps {
  // Play link, like the Jellyfin logo on movie pages
  stashUrl?: string;
  stashDbUrl?: string;
  tpdbUrl?: string;
  studioUrl?: string;
}

const linkClass =
  'flex items-center gap-1.5 text-sm font-bold text-white opacity-50 transition duration-300 hover:opacity-100';

// ExternalLinkBlock for scenes and XXX movies. StashDB has no logo of its
// own, so it shares the Stash box with its name next to it
const AdultLinkBlock = ({
  stashUrl,
  stashDbUrl,
  tpdbUrl,
  studioUrl,
}: AdultLinkBlockProps) => {
  const intl = useIntl();

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {stashUrl && (
        <a
          href={stashUrl}
          className={linkClass}
          target="_blank"
          rel="noreferrer"
        >
          <StashLogo className="h-5 w-auto" />
          <span>Stash</span>
        </a>
      )}
      {stashDbUrl && (
        <a
          href={stashDbUrl}
          className={linkClass}
          target="_blank"
          rel="noreferrer"
        >
          <StashLogo className="h-5 w-auto" />
          <span>StashDB</span>
        </a>
      )}
      {tpdbUrl && (
        <a
          href={tpdbUrl}
          className="w-24 opacity-50 transition duration-300 hover:opacity-100"
          target="_blank"
          rel="noreferrer"
          aria-label="ThePornDB"
        >
          <TpdbLogo />
        </a>
      )}
      {studioUrl && (
        <a
          href={studioUrl}
          className={linkClass}
          target="_blank"
          rel="noreferrer"
        >
          <GlobeAltIcon className="h-4 w-4" />
          <span>{intl.formatMessage(messages.studioSite)}</span>
        </a>
      )}
    </div>
  );
};

export default AdultLinkBlock;
