// Configuration dynamique : complète app.json avec des valeurs fournies au moment du build (GitHub Actions, EAS…).
// Aucune valeur secrète ici : la clé Google Maps Android est restreinte au paquet de l'app côté Google Cloud.
module.exports = ({ config }) => {
  const mapsKey = process.env.GOOGLE_MAPS_ANDROID_API_KEY || '';
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
  return {
    ...config,
    android: {
      ...config.android,
      // Chaque build GitHub a un numéro de version croissant : Android accepte la mise à jour par-dessus l'ancienne.
      ...(runNumber ? { versionCode: runNumber } : {}),
      ...(mapsKey ? { config: { ...(config.android?.config ?? {}), googleMaps: { apiKey: mapsKey } } } : {}),
    },
    extra: {
      ...(config.extra ?? {}),
      googleMapsConfigured: Boolean(mapsKey),
      buildNumber: runNumber || null,
    },
  };
};
