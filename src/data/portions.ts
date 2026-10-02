/**
 * Ce que contient UNE portion (le prix affiché est « par portion ») : 1 assiette, 200 ml, 10 pièces…
 * Synchronisé avec la contrainte SQL `meals.portion_unit` (migration 20261004000100_portion_units.sql).
 */
import { getLang } from '@/i18n';

export type PortionUnit = 'plate' | 'bowl' | 'box' | 'item' | 'slice' | 'jar' | 'ml' | 'l' | 'g' | 'kg';

interface UnitDef {
  id: PortionUnit;
  fr: [string, string];
  en: [string, string];
  /** Unité de mesure (ml, g…) : la quantité s'affiche toujours (« 200 ml »). Sinon : « assiette », « 10 pièces ». */
  measure?: boolean;
  /** Quantités proposées d'un toucher. */
  quick: number[];
}

export const PORTION_UNITS: UnitDef[] = [
  { id: 'plate', fr: ['assiette', 'assiettes'], en: ['plate', 'plates'], quick: [1] },
  { id: 'bowl', fr: ['bol', 'bols'], en: ['bowl', 'bowls'], quick: [1] },
  { id: 'box', fr: ['boîte', 'boîtes'], en: ['container', 'containers'], quick: [1, 2] },
  { id: 'item', fr: ['pièce', 'pièces'], en: ['piece', 'pieces'], quick: [1, 2, 6, 10, 12] },
  { id: 'slice', fr: ['part', 'parts'], en: ['slice', 'slices'], quick: [1, 2] },
  { id: 'jar', fr: ['pot', 'pots'], en: ['jar', 'jars'], quick: [1] },
  { id: 'ml', fr: ['ml', 'ml'], en: ['ml', 'ml'], measure: true, quick: [250, 500, 750, 1000] },
  { id: 'l', fr: ['l', 'l'], en: ['l', 'l'], measure: true, quick: [1, 2] },
  { id: 'g', fr: ['g', 'g'], en: ['g', 'g'], measure: true, quick: [100, 250, 500] },
  { id: 'kg', fr: ['kg', 'kg'], en: ['kg', 'kg'], measure: true, quick: [1] },
];

export const DEFAULT_PORTION = { qty: 1, unit: 'plate' as PortionUnit };

export const unitDef = (id?: string | null) => PORTION_UNITS.find((u) => u.id === id) ?? PORTION_UNITS[0];

/** Nom de l'unité, au singulier ou au pluriel, dans la langue de l'app. */
export function unitName(id: PortionUnit, qty = 1): string {
  const names = unitDef(id)[getLang() === 'en' ? 'en' : 'fr'];
  return qty > 1 && !unitDef(id).measure ? names[1] : names[0];
}

const num = (n: number) => (getLang() === 'en' ? String(n) : String(n).replace('.', ','));

/** « assiette », « 200 ml », « 10 pièces », « 1,5 kg ». */
export function formatPortion(qty?: number | null, unit?: string | null): string {
  const u = unitDef(unit);
  const q = Number(qty) > 0 ? Number(qty) : 1;
  if (!u.measure && q === 1) return unitName(u.id, 1);
  return `${num(q)} ${unitName(u.id, q)}`;
}
