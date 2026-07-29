// babel-preset-expo covers JSX, the Expo Router entry and Hermes targets.
// react-native-worklets/plugin (Reanimated 4's worklet transform) must stay LAST —
// it rewrites function bodies and expects every other transform to have run.
module.exports = function (api) {
  api.cache(true)
  return {
    presets: ['babel-preset-expo'],
    plugins: ['react-native-worklets/plugin'],
  }
}
