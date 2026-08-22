const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Web support for expo-sqlite: the driver is compiled to WebAssembly and runs
// in a worker backed by SharedArrayBuffer, which needs the wasm asset to
// resolve and the dev server to send cross-origin isolation headers. Native
// builds ignore both. See https://docs.expo.dev/versions/latest/sdk/sqlite/
config.resolver.assetExts.push('wasm');

config.server = {
  ...config.server,
  enhanceMiddleware: (middleware) => (req, res, next) => {
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'credentialless');
    return middleware(req, res, next);
  },
};

module.exports = config;
