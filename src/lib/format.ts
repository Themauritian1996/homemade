import { getLang, locale, t } from '@/i18n';

/** Séparateur décimal de la langue : virgule en français, point en anglais. */
const decimal = (s: string) => (getLang() === 'en' ? s : s.replace('.', ','));

export const formatPrice = (cents: number | null | undefined) =>
  cents == null ? t('Échange') : new Intl.NumberFormat(locale(), { style: 'currency', currency: 'CAD' }).format(cents / 100);

export const formatDistance = (km?: number) => (km == null ? '' : km < 1 ? `${Math.round(km * 1000)} m` : `${decimal(km.toFixed(1))} km`);

// Tronqué (pas arrondi) : 4,95 s'affiche 4,9 — un « 5,0 » doit être mérité.
export const formatRating = (r: number | null) => (r == null ? t('Nouveau') : decimal((Math.floor(r * 10 + 1e-9) / 10).toFixed(1)));

export function timeLeft(iso: string): string {
  const ms = new Date(iso).getTime() - Date.now();
  if (ms <= 0) return t('Expiré');
  const h = Math.floor(ms / 3_600_000);
  if (h >= 24) return `${Math.floor(h / 24)} ${getLang() === 'en' ? 'd' : 'j'}`;
  if (h >= 1) return `${h} h`;
  return `${Math.max(1, Math.round(ms / 60_000))} min`;
}

export function relativeTime(iso: string): string {
  const s = Math.round((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return t("à l'instant");
  if (s < 3600) return t('il y a {n} min', { n: Math.floor(s / 60) });
  if (s < 86400) return t('il y a {n} h', { n: Math.floor(s / 3600) });
  return t('il y a {n} j', { n: Math.floor(s / 86400) });
}

/** Distance haversine en km. */
export function distanceKm(a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) {
  const R = 6371;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const la1 = (a.latitude * Math.PI) / 180;
  const la2 = (b.latitude * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
