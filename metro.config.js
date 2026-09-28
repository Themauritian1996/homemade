// Metro : sur le web (aperçu navigateur uniquement), les modules purement natifs sont remplacés par des stubs.
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const config = getDefaultConfig(__dirname);
const webStubs = {
  'react-native-maps': path.resolve(__dirname, 'src/web-stubs/react-native-maps.tsx'),
  '@stripe/stripe-react-native': path.resolve(__dirname, 'src/web-stubs/stripe.tsx'),
};

const defaultResolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (platform === 'web' && webStubs[moduleName]) return { type: 'sourceFile', filePath: webStubs[moduleName] };
  return (defaultResolve ?? context.resolveRequest)(context, moduleName, platform);
};

module.exports = config;
