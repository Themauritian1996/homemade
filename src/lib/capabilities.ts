/** Capacités qui dépendent de l'environnement d'exécution (Expo Go, APK autonome, web). */
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

/**
 * Google Maps sur Android exige une clé dans les builds autonomes (APK). Expo Go en embarque une.
 * Sans clé, on affiche une liste par distance plutôt que de risquer un plantage de la carte.
 */
export function mapsAvailable(): boolean {
  if (Platform.OS !== 'android') return true;
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient) return true;
  return Boolean(Constants.expoConfig?.extra?.googleMapsConfigured);
}
