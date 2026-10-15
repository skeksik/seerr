import AfdbLogo from '@app/assets/services/brands/afdb.svg';
import BlueskyLogo from '@app/assets/services/brands/bluesky.svg';
import ChaturbateLogo from '@app/assets/services/brands/chaturbate.svg';
import FacebookLogo from '@app/assets/services/brands/facebook.svg';
import InstagramLogo from '@app/assets/services/brands/instagram.svg';
import LinktreeLogo from '@app/assets/services/brands/linktree.svg';
import ManyVidsLogo from '@app/assets/services/brands/manyvids.svg';
import MyFreeCamsLogo from '@app/assets/services/brands/myfreecams.svg';
import OnlyFansLogo from '@app/assets/services/brands/onlyfans.svg';
import PatreonLogo from '@app/assets/services/brands/patreon.svg';
import PornhubLogo from '@app/assets/services/brands/pornhub.svg';
import RedditLogo from '@app/assets/services/brands/reddit.svg';
import SnapchatLogo from '@app/assets/services/brands/snapchat.svg';
import TelegramLogo from '@app/assets/services/brands/telegram.svg';
import ThreadsLogo from '@app/assets/services/brands/threads.svg';
import TikTokLogo from '@app/assets/services/brands/tiktok.svg';
import TumblrLogo from '@app/assets/services/brands/tumblr.svg';
import TwitchLogo from '@app/assets/services/brands/twitch.svg';
import WikidataLogo from '@app/assets/services/brands/wikidata.svg';
import XLogo from '@app/assets/services/brands/x.svg';
import YouTubeLogo from '@app/assets/services/brands/youtube.svg';
import ImdbLogo from '@app/assets/services/imdb.svg';
import StashLogo from '@app/assets/services/stash.svg';
import TmdbLogo from '@app/assets/services/tmdb.svg';
import TpdbIcon from '@app/assets/services/tpdb-icon.svg';
import Tooltip from '@app/components/Common/Tooltip';
import SiteIcon from '@app/components/SiteIcon';
import useSiteIcons from '@app/hooks/useSiteIcons';

type Logo = React.FC<React.SVGProps<SVGSVGElement>>;

// Logos by host, for links without a StashDB icon. Brand logos keep their
// colours; the single-colour ones take the text colour. See
// assets/services/brands for their sources
const logos: [RegExp, Logo, string?][] = [
  [/(^|\.)stashdb\.org$/, StashLogo, 'h-5 w-7'],
  [/(^|\.)theporndb\.net$/, TpdbIcon, 'h-5 w-5'],
  [/(^|\.)imdb\.com$/, ImdbLogo, 'h-5 w-10'],
  [/(^|\.)themoviedb\.org$/, TmdbLogo, 'h-6 w-8'],
  [/(^|\.)adultfilmdatabase\.com$/, AfdbLogo, 'h-4 w-40'],
  [/(^|\.)pornhub\.com$/, PornhubLogo, 'h-5 w-14'],
  [/(^|\.)manyvids\.com$/, ManyVidsLogo, 'h-4 w-24 fill-current'],
  [/(^|\.)chaturbate\.com$/, ChaturbateLogo, 'h-5 w-16'],
  [/(^|\.)myfreecams\.com$/, MyFreeCamsLogo, 'h-4 w-36'],
  [/(^|\.)(twitter|x)\.com$/, XLogo],
  [/(^|\.)instagram\.com$/, InstagramLogo],
  [/(^|\.)onlyfans\.com$/, OnlyFansLogo],
  [/(^|\.)tiktok\.com$/, TikTokLogo],
  [/(^|\.)linktr\.ee$/, LinktreeLogo],
  [/(^|\.)wikidata\.org$/, WikidataLogo],
  [/(^|\.)(youtube\.com|youtu\.be)$/, YouTubeLogo],
  [/(^|\.)reddit\.com$/, RedditLogo],
  [/(^|\.)facebook\.com$/, FacebookLogo],
  [/(^|\.)patreon\.com$/, PatreonLogo],
  [/(^|\.)snapchat\.com$/, SnapchatLogo],
  [/(^|\.)(t\.me|telegram\.me)$/, TelegramLogo],
  [/(^|\.)bsky\.app$/, BlueskyLogo],
  [/(^|\.)threads\.(net|com)$/, ThreadsLogo],
  [/(^|\.)twitch\.tv$/, TwitchLogo],
  [/(^|\.)tumblr\.com$/, TumblrLogo],
];

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
}

// The TMDB and IMDb logos of a person page, for StashDB performers and
// studios and their many profile links
const AdultProfileLinks = ({ links }: { links: ProfileLink[] }) => {
  const siteIcon = useSiteIcons();
  const seen = new Set<string>();
  const unique = links
    .filter(({ url }) => {
      const key = url.replace(/\/+$/, '').toLowerCase();
      return seen.has(key) ? false : (seen.add(key), true);
    })
    // Links of our own, like ThePornDB's, get StashDB's icon by host
    .map((link) => ({ ...link, icon: link.icon ?? siteIcon(link.url) }));

  // StashDB's icon for the site first, then a logo of ours
  const shown = unique.flatMap((link) => {
    const found = link.icon
      ? undefined
      : logos.find(([pattern]) => pattern.test(hostOf(link.url)));
    return link.icon || found
      ? [{ ...link, Logo: found?.[1], size: found?.[2] }]
      : [];
  });
  // Sites with neither are listed by name, so they stay apart
  const named = unique.filter(
    (link) => !shown.some(({ url }) => url === link.url)
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
      {shown.map(({ url, site, icon, Logo, size }) => (
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
      ))}
      {named.map(({ url, site }) => (
        <a
          key={url}
          href={url}
          target="_blank"
          rel="noreferrer"
          className="text-sm font-semibold text-white opacity-50 transition duration-300 hover:opacity-100"
        >
          {site}
        </a>
      ))}
    </div>
  );
};

export default AdultProfileLinks;
