// Configuration dynamique : complète app.json avec des valeurs fournies au moment du build (GitHub Actions, EAS…).
// Aucune valeur secrète ici.
module.exports = ({ config }) => {
  const runNumber = Number(process.env.GITHUB_RUN_NUMBER || 0);
  return {
    ...config,
    android: {
      ...config.android,
      // Chaque build GitHub a un numéro de version croissant : Android accepte la mise à jour par-dessus l'ancienne.
      ...(runNumber ? { versionCode: runNumber } : {}),
    },
    extra: {
      ...(config.extra ?? {}),
      buildNumber: runNumber || null,
    },
  };
};
