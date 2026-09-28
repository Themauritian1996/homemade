/**
 * Règles de cohérence appliquées avant publication (miroir des contraintes de `publish_meal` en SQL).
 * Objectif : empêcher une déclaration contradictoire (ex. « végane » + lait).
 */
import type { AllergenCode, DietCode } from '@/data/allergens';
import type { MealIngredient } from '@/types';
import { expandAllergens } from './safety';

const DIET_FORBIDS: Partial<Record<DietCode, AllergenCode[]>> = {
  vegan: ['milk', 'egg', 'fish', 'crustacean', 'mollusc'],
  vegetarian: ['fish', 'crustacean', 'mollusc'],
  gluten_free: ['wheat', 'gluten'],
  dairy_free: ['milk'],
};

export function declaredAllergens(ingredients: MealIngredient[], extra: AllergenCode[]): AllergenCode[] {
  return [...expandAllergens([...ingredients.flatMap((i) => i.allergens), ...extra])];
}

export function validateMealDraft(d: {
  title: string;
  ingredients: MealIngredient[];
  allergens: AllergenCode[];
  diets: DietCode[];
  mode: 'sale' | 'swap' | 'both';
  priceCents: number | null;
  portions: number;
  attestation: boolean;
}): string[] {
  const errors: string[] = [];
  if (d.title.trim().length < 4) errors.push('Donnez un titre à votre plat.');
  if (d.ingredients.length === 0) errors.push('Ajoutez au moins un ingrédient.');
  if (d.mode !== 'swap' && (d.priceCents == null || d.priceCents < 200 || d.priceCents > 5000))
    errors.push('Le prix doit être entre 2 $ et 50 $ par portion.');
  if (d.portions < 1 || d.portions > 20) errors.push('Entre 1 et 20 portions.');
  for (const diet of d.diets) {
    const clash = (DIET_FORBIDS[diet] ?? []).filter((a) => d.allergens.includes(a));
    if (clash.length) errors.push(`Incohérence : « ${diet} » est incompatible avec ${clash.join(', ')}.`);
  }
  if (!d.attestation) errors.push('Vous devez confirmer avoir vérifié les ingrédients et les allergènes.');
  return errors;
}
