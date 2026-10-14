import ImageProxy from '@server/lib/imageproxy';
import { getSettings } from '@server/lib/settings';
import logger from '@server/logger';
import { Router } from 'express';
import mime from 'mime';

const router = Router();

// Delay the initialization of ImageProxy instances until the proxy (if any) is properly configured
let _tmdbImageProxy: ImageProxy;
function initTmdbImageProxy() {
  if (!_tmdbImageProxy) {
    _tmdbImageProxy = new ImageProxy('tmdb', 'https://image.tmdb.org', {
      rateLimitOptions: {
        maxRequests: 20,
        maxRPS: 50,
      },
    });
  }
  return _tmdbImageProxy;
}
let _tvdbImageProxy: ImageProxy;
function initTvdbImageProxy() {
  if (!_tvdbImageProxy) {
    _tvdbImageProxy = new ImageProxy('tvdb', 'https://artworks.thetvdb.com', {
      rateLimitOptions: {
        maxRequests: 20,
        maxRPS: 50,
      },
    });
  }
  return _tvdbImageProxy;
}

// The stash-box endpoint is configurable, so rebuild the proxy when it moves
let _stashDbImageProxy: { origin: string; proxy: ImageProxy } | undefined;
function initStashDbImageProxy() {
  const origin = new URL(getSettings().stashdb.endpoint).origin;
  if (_stashDbImageProxy?.origin !== origin) {
    _stashDbImageProxy = {
      origin,
      proxy: new ImageProxy('stashdb', origin, {
        rateLimitOptions: {
          maxRequests: 4,
          maxRPS: 4,
        },
      }),
    };
  }
  return _stashDbImageProxy.proxy;
}

const stashDbImageSizes = ['300', '600', '1280'];

router.get<{
  type: string;
  path: string[];
}>('/:type/*path', async (req, res, next) => {
  const imagePath = '/' + req.params.path.join('/');

  if (imagePath.startsWith('//') || imagePath.includes('://')) {
    logger.error('Invalid URL for image proxy', { imagePath });
    return next({ status: 403, message: 'Invalid URL for image proxy.' });
  }

  try {
    let imageData;
    if (req.params.type === 'tmdb') {
      imageData = await initTmdbImageProxy().getImage(imagePath);
    } else if (req.params.type === 'tvdb') {
      imageData = await initTvdbImageProxy().getImage(imagePath);
    } else if (
      req.params.type === 'stashdb' &&
      /^\/images\/[0-9a-f-]+$/.test(imagePath)
    ) {
      const size = String(req.query.size ?? '');
      imageData = await initStashDbImageProxy().getImage(
        stashDbImageSizes.includes(size)
          ? `${imagePath}?size=${size}`
          : imagePath
      );
    } else {
      logger.error('Unsupported image type', {
        imagePath,
        type: req.params.type,
      });
      return next({ status: 400, message: 'Unsupported image type.' });
    }

    res.writeHead(200, {
      // svg needs its full type (image/svg+xml) for browsers to render it
      'Content-Type':
        mime.getType(imageData.meta.extension ?? '') ??
        `image/${imageData.meta.extension}`,
      // Studio logos are user-uploaded SVGs; never let one run script when
      // opened directly on this origin
      'Content-Security-Policy':
        "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'X-Content-Type-Options': 'nosniff',
      'Content-Length': imageData.imageBuffer.length,
      'Cache-Control': `public, max-age=${imageData.meta.curRevalidate}`,
      'OS-Cache-Key': imageData.meta.cacheKey,
      'OS-Cache-Status': imageData.meta.cacheMiss ? 'MISS' : 'HIT',
    });

    res.end(imageData.imageBuffer);
  } catch (e) {
    logger.error('Failed to proxy image', {
      imagePath,
      errorMessage: e.message,
    });
    if (!res.headersSent) {
      return next({ status: 500, message: 'Failed to proxy image.' });
    }
    next(e);
  }
});

export default router;
