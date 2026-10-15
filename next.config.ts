import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  env: {
    commitTag: process.env.COMMIT_TAG || 'local',
    unsafeDoNotUseDemo: process.env.UNSAFE_DO_NOT_USE_DEMO,
  },
  images: {
    remotePatterns: [
      { hostname: 'gravatar.com' },
      { hostname: 'image.tmdb.org' },
      { hostname: 'artworks.thetvdb.com' },
      { hostname: 'plex.tv' },
    ],
  },
  // Adult tabs moved under Discover, and XXX movies became adult movies
  async redirects() {
    return [
      ['/scenes/browse', '/discover/scenes'],
      ['/scenes/:path*', '/discover/scenes/:path*'],
      ['/xxxmovies/:path*', '/discover/adultmovies/:path*'],
      ['/xxxmovie/:path*', '/adultmovie/:path*'],
    ].map(([source, destination]) => ({
      source,
      destination,
      permanent: false,
    }));
  },
  transpilePackages: ['country-flag-icons'],
  turbopack: {
    rules: {
      '*.svg': {
        loaders: ['@svgr/webpack'],
        as: '*.js',
      },
    },
  },
  experimental: {
    scrollRestoration: true,
    largePageDataBytes: 512 * 1000,
  },
};

export default nextConfig;
