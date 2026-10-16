import { useCallback, useMemo } from 'react';
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

// StashDB's icons for the sites links point to, matched by host. Pass false
// when every link already has an icon, to skip the request
const useSiteIcons = (enabled = true) => {
  const { data } = useSWR<StashDbSite[]>(
    enabled ? '/api/v1/scene/sites' : null,
    {
      revalidateOnFocus: false,
      shouldRetryOnError: false,
      dedupingInterval: 3600000,
    }
  );
  // The first site of a host wins, as a lookup through the list would find
  const icons = useMemo(() => {
    const byHost = new Map<string, string>();
    (data ?? []).forEach((site) => {
      const host = hostOf(site.url);
      if (host && !byHost.has(host)) {
        byHost.set(host, site.icon);
      }
    });
    return byHost;
  }, [data]);

  return useCallback(
    (url: string): string | undefined => icons.get(hostOf(url)),
    [icons]
  );
};

export default useSiteIcons;
