module.exports = function (api) {
  api.cache(true);
  return {
    presets: [['babel-preset-expo', { jsxImportSource: 'react' }]],
    // react-native-worklets/plugin must remain the last plugin in the list.
    plugins: ['react-native-worklets/plugin'],
  };
};
