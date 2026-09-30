/**
 * Fusion d'une lecture d'étiquette / de recette (OCR) dans le brouillon d'annonce.
 * Règle fail-closed : les sources d'allergènes s'ADDITIONNENT, rien n'est retiré. Le Cooker révise ensuite.
 */
import type { AllergenCode } from '@/data/allergens';
import type { AiTextScan, MealIngredient } from '@/types';
import { expandAllergens } from './safety';

export interface ScanDraft {
  ingredients: MealIngredient[];
  /** Allergènes déclarés hors ingrédients. */
  extra: AllergenCode[];
  mayContain: AllergenCode[];
}

const norm = (s: string) =>
  s
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
const union = <T>(a: T[], b: T[]) => [...new Set([...a, ...b])];

/** Étiquette = UN produit utilisé dans le plat ; recette = la liste de ses ingrédients. */
export function ingredientsFromScan(scan: AiTextScan): MealIngredient[] {
  if (scan.source === 'label') {
    return [{ name: (scan.title.trim() || 'Produit (étiquette)').slice(0, 60), allergens: [...scan.contains], source: 'ai' }];
  }
  return scan.ingredients.map((i) => ({ name: i.name, allergens: [...i.allergens], source: 'ai' as const }));
}

export function mergeScan(draft: ScanDraft, scan: AiTextScan): ScanDraft {
  const ingredients = [...draft.ingredients];
  for (const next of ingredientsFromScan(scan)) {
    const idx = ingredients.findIndex((i) => norm(i.name) === norm(next.name));
    if (idx >= 0) ingredients[idx] = { ...ingredients[idx], allergens: union(ingredients[idx].allergens, next.allergens) };
    else ingredients.push(next);
  }
  const fromIngredients = expandAllergens(ingredients.flatMap((i) => i.allergens));
  const extra = union(
    draft.extra,
    scan.contains.filter((c) => !fromIngredients.has(c)),
  );
  const declared = expandAllergens([...fromIngredients, ...extra]);
  const mayContain = union(draft.mayContain, scan.mayContain).filter((c) => !declared.has(c));
  return { ingredients, extra, mayContain };
}
