import TelegramLogo from '@app/assets/services/brands/telegram.svg';
import ThreadsLogo from '@app/assets/services/brands/threads.svg';
import Tooltip from '@app/components/Common/Tooltip';
import SiteIcon from '@app/components/SiteIcon';
import useSiteIcons from '@app/hooks/useSiteIcons';
import { HomeIcon } from '@heroicons/react/24/outline';

type Logo = React.FC<React.SVGProps<SVGSVGElement>>;

// Logos by host, for the sites StashDB has no icon for; they take the text
// colour. See assets/services/brands for their sources
const logos: [RegExp, Logo, string?][] = [
  [/(^|\.)(t\.me|telegram\.me)$/, TelegramLogo],
  [/(^|\.)threads\.(net|com)$/, ThreadsLogo],
];

// StashDB and ThePornDB name a studio's own site like this
const HOME_SITES = ['home', 'official website', 'studio'];

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return '';
  }
};

export interface ProfileLink {
  url: string;
  // Site name, shown on hover
  site: string;
  // stash-box's icon for the site, shown over a logo of ours
  icon?: string;
  // A logo for a link no host of ours matches, like a Stash server's
  logo?: [Logo, string?];
}

const alignments = {
  // Centred on small screens, like the rest of a person page's header
  responsive: 'justify-center lg:justify-start',
  center: 'justify-center',
  end: 'justify-end',
};

interface AdultProfileLinksProps {
  links: ProfileLink[];
  // Spacing between the links
  className?: string;
  align?: keyof typeof alignments;
  // Sites listed by name even when they have a logo, like StashDB next to
  // a Stash play link, whose logos are the same
  textSites?: string[];
}

// A logo of ours for the link: its own, one by host, or a studio's home
const logoFor = (link: ProfileLink): [Logo, string?] | undefined => {
  if (link.logo) {
    return link.logo;
  }

  const host = hostOf(link.url);
  const found = logos.find(([pattern]) => pattern.test(host));

  if (found) {
    return [found[1], found[2]];
  }

  return HOME_SITES.includes(link.site.toLowerCase())
    ? [HomeIcon as Logo, 'h-5 w-5']
    : undefined;
};

// A link with what it shows as: StashDB's icon for the site, else a logo of
// ours, else its name
export interface ShownLink extends ProfileLink {
  Logo?: Logo;
  size?: string;
}

const isIcon = (link: ShownLink): boolean => !!link.icon || !!link.Logo;

// The links without duplicates, in order, each resolved to an icon, a logo or
// its name; shown holds the first two kinds, named the rest. Title pages
// split them between the facts table and the link block
export const useLinkKinds = (
  links: ProfileLink[],
  textSites: string[] = []
): { links: ShownLink[]; shown: ShownLink[]; named: ShownLink[] } => {
  const seen = new Set<string>();
  const unique = links.filter(({ url }) => {
    const key = url.replace(/\/+$/, '').toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });
  const isText = (link: ProfileLink) => textSites.includes(link.site);
  // Links of our own, like ThePornDB's, get StashDB's icon by host
  const siteIcon = useSiteIcons(
    unique.some((link) => !link.icon && !isText(link))
  );

  // StashDB's icon for the site first, then a logo of ours
  const resolved = unique.map((link): ShownLink => {
    if (isText(link)) {
      return { ...link, icon: undefined };
    }
    const icon = link.icon ?? siteIcon(link.url);
    const logo = icon ? undefined : logoFor(link);
    return { ...link, icon, Logo: logo?.[0], size: logo?.[1] };
  });

  return {
    links: resolved,
    shown: resolved.filter(isIcon),
    named: resolved.filter((link) => !isIcon(link)),
  };
};

// The TMDB and IMDb logos of a person page, for StashDB performers and
// studios and their many profile links, and for the links of title pages.
// Links keep their order, so StashDB's can come first, by name
const AdultProfileLinks = ({
  links,
  className = 'gap-x-4 gap-y-2',
  align = 'responsive',
  textSites = [],
}: AdultProfileLinksProps) => {
  const { links: resolved } = useLinkKinds(links, textSites);

  return (
    <div
      className={`flex flex-wrap items-center ${alignments[align]} ${className}`}
    >
      {resolved.map(({ url, site, icon, Logo, size }) =>
        icon || Logo ? (
          <Tooltip key={url} content={site}>
            <a
              href={url}
              target="_blank"
              rel="noreferrer"
              aria-label={site}
              className="flex h-6 items-center text-white opacity-50 transition duration-300 hover:opacity-100"
            >
              {icon ? (
                <SiteIcon icon={icon} />
              ) : (
                Logo && <Logo className={size ?? 'h-5 w-5 fill-current'} />
              )}
            </a>
          </Tooltip>
        ) : (
          <a
            key={url}
            href={url}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-semibold text-white opacity-50 transition duration-300 hover:opacity-100"
          >
            {site}
          </a>
        )
      )}
    </div>
  );
};

export default AdultProfileLinks;
