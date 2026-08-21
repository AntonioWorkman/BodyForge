/**
 * Native entry point.
 *
 * Skia is a native module on iOS and Android, so there is nothing to load
 * first. The web build uses `index.web.js` instead, which Metro selects by
 * platform — keeping CanvasKit's loader, and its Node-only dependencies, out of
 * the native bundle entirely.
 */
require('expo-router/entry');
