import type { AllSettings } from '@server/lib/settings';

// Stash is entered like Jellyfin now: hostname, port, SSL and URL base
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const splitStashUrl = (settings: any): AllSettings => {
  if (
    Array.isArray(settings.migrations) &&
    settings.migrations.includes('0010_split_stash_url')
  ) {
    return settings;
  }

  const stash = settings.stash;

  if (stash && typeof stash.url === 'string') {
    try {
      const url = new URL(stash.url);
      const useSsl = url.protocol === 'https:';
      stash.hostname = url.hostname;
      stash.port = url.port ? Number(url.port) : useSsl ? 443 : 80;
      stash.useSsl = useSsl;
      stash.urlBase = url.pathname.replace(/\/+$/, '');
    } catch {
      // Empty or not a URL: Stash was never set up
    }
    delete stash.url;
  }

  if (!Array.isArray(settings.migrations)) {
    settings.migrations = [];
  }
  settings.migrations.push('0010_split_stash_url');

  return settings;
};

export default splitStashUrl;
