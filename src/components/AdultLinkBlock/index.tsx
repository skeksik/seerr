import StashLogo from '@app/assets/services/stash.svg';
import type { ProfileLink } from '@app/components/AdultProfileLinks';
import AdultProfileLinks from '@app/components/AdultProfileLinks';

interface AdultLinkBlockProps {
  stashDbUrl?: string;
  // Play link, like the Jellyfin logo on movie pages
  stashUrl?: string;
  tpdbUrl?: string;
  // The title's own links with an icon or a logo, after ours
  links?: ProfileLink[];
}

// ExternalLinkBlock for scenes and adult movies: logos and icons alone, named
// on hover. StashDB comes first and is named, which keeps it apart from
// Stash's logo
const AdultLinkBlock = ({
  stashDbUrl,
  stashUrl,
  tpdbUrl,
  links: own = [],
}: AdultLinkBlockProps) => {
  const links: ProfileLink[] = [];

  if (stashDbUrl) {
    links.push({ url: stashDbUrl, site: 'StashDB' });
  }
  if (stashUrl) {
    links.push({
      url: stashUrl,
      site: 'Stash',
      logo: [StashLogo, 'h-5 w-auto'],
    });
  }
  if (tpdbUrl) {
    // StashDB's icon for ThePornDB, like the other links
    links.push({ url: tpdbUrl, site: 'ThePornDB' });
  }
  links.push(...own);

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
