// stash-box resizes images on request; full size covers are several megabytes
export type StashImageSize = 300 | 600 | 1280;

export const stashImageUrl = (
  url: string | undefined,
  size: StashImageSize
): string | undefined => (url ? `${url}?size=${size}` : undefined);
