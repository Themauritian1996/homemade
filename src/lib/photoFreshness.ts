/**
 * Indice de fraîcheur de la photo d'un plat (affiché aux voisins).
 * Appareil photo : prise au moment de publier. Galerie : date de prise de vue lue dans la photo (EXIF) si elle existe.
 * C'est un indice de confiance, pas une preuve : une date de photo peut être modifiée.
 */
import { t } from '@/i18n';
import type { Meal } from '@/types';

export type Freshness = { label: string; fresh: boolean };

export function photoFreshness(meal: Pick<Meal, 'photoSource' | 'photoTakenAt' | 'createdAt'>): Freshness | null {
  if (!meal.photoSource) return null;
  if (meal.photoSource === 'camera') return { label: t('📸 Photo prise à la publication'), fresh: true };
  if (!meal.photoTakenAt) return { label: t('🖼️ Photo de la galerie'), fresh: false };
  const ref = meal.createdAt ? new Date(meal.createdAt).getTime() : Date.now();
  const hours = (ref - new Date(meal.photoTakenAt).getTime()) / 3_600_000;
  if (hours <= 24) return { label: t('📸 Photo du jour'), fresh: true };
  if (hours <= 72) return { label: t('📸 Photo récente ({n} j)', { n: Math.max(1, Math.round(hours / 24)) }), fresh: true };
  return { label: t('🖼️ Photo de la galerie · prise il y a {n} j', { n: Math.round(hours / 24) }), fresh: false };
}

/** Date EXIF « AAAA:MM:JJ HH:MM:SS » (heure locale de l'appareil) → ISO ; null si absente ou illisible. */
export function exifDate(exif: Record<string, unknown> | null | undefined): string | null {
  const raw = (exif?.DateTimeOriginal ?? exif?.DateTimeDigitized ?? exif?.DateTime) as string | undefined;
  const m = typeof raw === 'string' ? raw.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/) : null;
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5]), Number(m[6]));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
