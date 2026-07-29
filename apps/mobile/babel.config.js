// babel-preset-expo covers JSX, the Expo Router entry and Hermes targets.
// react-native-worklets/plugin (Reanimated 4's worklet transform) must stay LAST —
// it rewrites function bodies and expects every other transform to have run.
module.exports = function (api) {
  api.cache(true)
  return {
    // jsxImportSource: nativewind — this is what teaches every RN component to accept
    // className. babel-preset-expo must still come first; nativewind extends it.
    presets: [
      ['babel-preset-expo', { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['react-native-worklets/plugin'],
  }
}
