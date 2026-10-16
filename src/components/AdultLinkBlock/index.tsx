import StashLogo from '@app/assets/services/stash.svg';
import TpdbIcon from '@app/assets/services/tpdb-icon.svg';
import type { ProfileLink } from '@app/components/AdultProfileLinks';
import AdultProfileLinks from '@app/components/AdultProfileLinks';

interface AdultLinkBlockProps {
  // Play link, like the Jellyfin logo on movie pages
  stashUrl?: string;
  stashDbUrl?: string;
  tpdbUrl?: string;
}

// ExternalLinkBlock for scenes and adult movies: logos and icons alone, named
// on hover. StashDB is named, which keeps it apart from Stash's logo
const AdultLinkBlock = ({
  stashUrl,
  stashDbUrl,
  tpdbUrl,
}: AdultLinkBlockProps) => {
  const links: ProfileLink[] = [];

  if (stashUrl) {
    links.push({
      url: stashUrl,
      site: 'Stash',
      logo: [StashLogo, 'h-5 w-auto'],
    });
  }
  if (stashDbUrl) {
    links.push({ url: stashDbUrl, site: 'StashDB' });
  }
  if (tpdbUrl) {
    // ThePornDB's small logo, sized like the other services' logos
    links.push({
      url: tpdbUrl,
      site: 'ThePornDB',
      logo: [TpdbIcon, 'h-7 w-7'],
    });
  }

  return (
    <AdultProfileLinks
      links={links}
      align="center"
      className="w-full gap-x-5 gap-y-2"
      textSites={['StashDB']}
    />
  );
};

export default AdultLinkBlock;
