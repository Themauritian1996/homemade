// Metro :
//  1. Sur le web (aperçu navigateur uniquement), les modules purement natifs sont remplacés par des stubs.
//  2. En développement, `/local-ai/*` est relayé vers Ollama (http://127.0.0.1:11434) sur le PC : le téléphone,
//     qui joint déjà Metro en Wi-Fi, peut ainsi utiliser l'IA locale sans rien ouvrir d'autre sur le réseau.
const { getDefaultConfig } = require('expo/metro-config');
const http = require('http');
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

const OLLAMA_URL = new URL(process.env.OLLAMA_URL || 'http://127.0.0.1:11434');
const LOCAL_AI_PREFIX = '/local-ai/';

config.server = config.server || {};
const previousEnhance = config.server.enhanceMiddleware;
config.server.enhanceMiddleware = (middleware, server) => {
  const base = previousEnhance ? previousEnhance(middleware, server) : middleware;
  return (req, res, next) => {
    if (!req.url || !req.url.startsWith(LOCAL_AI_PREFIX)) return base(req, res, next);
    // Seules les routes de génération d'Ollama sont relayées (pas de gestion de modèles depuis le réseau).
    const target = '/' + req.url.slice(LOCAL_AI_PREFIX.length);
    if (!['/api/chat', '/api/tags'].includes(target.split('?')[0])) {
      res.statusCode = 404;
      return res.end('local-ai: route non autorisée');
    }
    const proxy = http.request(
      { hostname: OLLAMA_URL.hostname, port: OLLAMA_URL.port, path: target, method: req.method, headers: { 'content-type': 'application/json' } },
      (upstream) => {
        res.writeHead(upstream.statusCode || 502, { 'content-type': 'application/json', 'access-control-allow-origin': '*' });
        upstream.pipe(res);
      },
    );
    proxy.setTimeout(180000, () => proxy.destroy(new Error('timeout')));
    proxy.on('error', (e) => {
      res.statusCode = 502;
      res.end(JSON.stringify({ error: `Ollama injoignable : ${e.message}` }));
    });
    req.pipe(proxy);
  };
};

module.exports = config;
