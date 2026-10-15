import useSWR from 'swr';

interface StashDbSite {
  name: string;
  url: string;
  icon: string;
}

const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '').toLowerCase();
  } catch {
    return '';
  }
};

// StashDB's icons for the sites links point to, matched by host
const useSiteIcons = () => {
  const { data } = useSWR<StashDbSite[]>('/api/v1/scene/sites', {
    revalidateOnFocus: false,
    shouldRetryOnError: false,
    dedupingInterval: 3600000,
  });

  return (url: string): string | undefined => {
    const host = hostOf(url);
    return host
      ? data?.find((site) => hostOf(site.url) === host)?.icon
      : undefined;
  };
};

export default useSiteIcons;
