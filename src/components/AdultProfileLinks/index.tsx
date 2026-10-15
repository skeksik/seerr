import BlueskyLogo from '@app/assets/services/brands/bluesky.svg';
import FacebookLogo from '@app/assets/services/brands/facebook.svg';
import InstagramLogo from '@app/assets/services/brands/instagram.svg';
import LinktreeLogo from '@app/assets/services/brands/linktree.svg';
import OnlyFansLogo from '@app/assets/services/brands/onlyfans.svg';
import PatreonLogo from '@app/assets/services/brands/patreon.svg';
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

type Logo = React.FC<React.SVGProps<SVGSVGElement>>;

// Logos by host. Brand logos keep their colours; the single-colour ones
// from Simple Icons take the text colour
const logos: [RegExp, Logo, string?][] = [
  [/(^|\.)stashdb\.org$/, StashLogo, 'h-5 w-7'],
  [/(^|\.)theporndb\.net$/, TpdbIcon, 'h-5 w-5'],
  [/(^|\.)imdb\.com$/, ImdbLogo, 'h-5 w-10'],
  [/(^|\.)themoviedb\.org$/, TmdbLogo, 'h-6 w-8'],
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
}

// The TMDB and IMDb logos of a person page, for StashDB performers and
// studios and their many profile links
const AdultProfileLinks = ({ links }: { links: ProfileLink[] }) => {
  const seen = new Set<string>();
  const unique = links.filter(({ url }) => {
    const key = url.replace(/\/+$/, '').toLowerCase();
    return seen.has(key) ? false : (seen.add(key), true);
  });

  const withLogo = unique.flatMap((link) => {
    const host = hostOf(link.url);
    const found = logos.find(([pattern]) => pattern.test(host));
    return found ? [{ ...link, Logo: found[1], size: found[2] }] : [];
  });
  // Sites without a logo are listed by name, so they stay apart
  const named = unique.filter(
    (link) => !withLogo.some(({ url }) => url === link.url)
  );

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 lg:justify-start">
      {withLogo.map(({ url, site, Logo, size }) => (
        <Tooltip key={url} content={site}>
          <a
            href={url}
            target="_blank"
            rel="noreferrer"
            aria-label={site}
            className="flex h-6 items-center text-white opacity-50 transition duration-300 hover:opacity-100"
          >
            <Logo className={size ?? 'h-5 w-5 fill-current'} />
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
