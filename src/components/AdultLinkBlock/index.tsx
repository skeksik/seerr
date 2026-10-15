import StashLogo from '@app/assets/services/stash.svg';
import TpdbLogo from '@app/assets/services/tpdb.svg';
import Tooltip from '@app/components/Common/Tooltip';
import SiteIcon from '@app/components/SiteIcon';
import useSiteIcons from '@app/hooks/useSiteIcons';

interface AdultLinkBlockProps {
  // Play link, like the Jellyfin logo on movie pages
  stashUrl?: string;
  stashDbUrl?: string;
  tpdbUrl?: string;
}

const linkClass =
  'flex items-center text-sm font-bold text-white opacity-50 transition duration-300 hover:opacity-100';

// ExternalLinkBlock for scenes and XXX movies: logos and icons alone, named
// on hover. StashDB has neither, and its name keeps it apart from Stash
const AdultLinkBlock = ({
  stashUrl,
  stashDbUrl,
  tpdbUrl,
}: AdultLinkBlockProps) => {
  const siteIcon = useSiteIcons();
  const tpdbIcon = tpdbUrl ? siteIcon(tpdbUrl) : undefined;

  return (
    <div className="flex w-full flex-wrap items-center justify-center gap-x-5 gap-y-2">
      {stashUrl && (
        <Tooltip content="Stash">
          <a
            href={stashUrl}
            className={linkClass}
            target="_blank"
            rel="noreferrer"
            aria-label="Stash"
          >
            <StashLogo className="h-5 w-auto" />
          </a>
        </Tooltip>
      )}
      {stashDbUrl && (
        <a
          href={stashDbUrl}
          className={linkClass}
          target="_blank"
          rel="noreferrer"
        >
          StashDB
        </a>
      )}
      {tpdbUrl &&
        (tpdbIcon ? (
          <Tooltip content="ThePornDB">
            <a
              href={tpdbUrl}
              className={linkClass}
              target="_blank"
              rel="noreferrer"
              aria-label="ThePornDB"
            >
              <SiteIcon icon={tpdbIcon} />
            </a>
          </Tooltip>
        ) : (
          <a
            href={tpdbUrl}
            className="w-24 opacity-50 transition duration-300 hover:opacity-100"
            target="_blank"
            rel="noreferrer"
            aria-label="ThePornDB"
          >
            <TpdbLogo />
          </a>
        ))}
    </div>
  );
};

export default AdultLinkBlock;
