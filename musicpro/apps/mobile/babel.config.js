module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    // Must be listed last (Reanimated requirement).
    plugins: ["react-native-reanimated/plugin"],
  };
};
