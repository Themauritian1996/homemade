/**
 * Configuration runtime. Les variables EXPO_PUBLIC_* sont embarquées dans le bundle :
 * n'y mettez JAMAIS de secret (clé service Supabase, clé secrète Stripe, clé Anthropic).
 * Ces secrets vivent uniquement dans les Edge Functions (`supabase secrets set`).
 */
export const config = {
  supabaseUrl: process.env.EXPO_PUBLIC_SUPABASE_URL ?? '',
  supabaseAnonKey: process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? '',
  stripePublishableKey: process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '',
  /** Commission plateforme appliquée aux ventes (affichage ; le calcul fait foi côté serveur). */
  platformFeeRate: 0.12,
  defaultRegion: { latitude: 45.5231, longitude: -73.5817, latitudeDelta: 0.06, longitudeDelta: 0.06 }, // Plateau, Montréal
};

/** Mode démo : actif tant que Supabase n'est pas configuré. Permet d'ouvrir l'app dans Expo Go immédiatement. */
export const DEMO_MODE = !config.supabaseUrl || !config.supabaseAnonKey;
