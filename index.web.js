/**
 * Web entry point.
 *
 * Skia on web is WebAssembly, and its module reads CanvasKit off the global
 * object the moment it is evaluated. CanvasKit therefore has to be instantiated
 * *before* the app's module graph loads — doing it during boot is already too
 * late. `scripts/prepare-web-assets.js` puts the binary at the site root.
 */
const { LoadSkiaWeb } = require('@shopify/react-native-skia/lib/module/web');

LoadSkiaWeb({ locateFile: (file) => `/${file}` })
  .catch((error) => {
    // The Core degrades to an empty canvas rather than blocking the app.
    console.warn('CanvasKit failed to load; graphics will be unavailable.', error);
  })
  .finally(() => {
    require('expo-router/entry');
  });
