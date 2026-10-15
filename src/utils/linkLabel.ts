// A link's site, e.g. "evilangel.com", for lists of outside links
export const linkLabel = (url: string): string => {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
};
