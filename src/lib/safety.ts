/**
 * Moteur de sécurité alimentaire côté client.
 *
 * ⚠️ La source de vérité est la fonction SQL `public.meal_is_safe_for()` (voir migrations) :
 * le fil d'actualité est filtré CÔTÉ SERVEUR. Cette implémentation miroir sert :
 *  - au mode démo (sans backend),
 *  - à l'affichage d'avertissements (ex. page détail ouverte via un lien partagé),
 *  - aux tests unitaires qui garantissent la parité avec le SQL.
 *
 * Règle d'or : en cas de doute, on EXCLUT (fail-closed).
 */
import type { AllergenCode, DietCode } from '@/data/allergens';
import type { HealthProfile, Meal } from '@/types';

/** Allergènes impliqués par d'autres (ex. blé ⇒ gluten). Miroir de `allergen_implications` en SQL. */
const IMPLIES: Partial<Record<AllergenCode, AllergenCode[]>> = {
  wheat: ['gluten'],
};

export function expandAllergens(codes: AllergenCode[]): Set<AllergenCode> {
  const out = new Set<AllergenCode>(codes);
  for (const c of codes) IMPLIES[c]?.forEach((x) => out.add(x));
  return out;
}

export interface SafetyVerdict {
  safe: boolean;
  conflicts: AllergenCode[];
  traceConflicts: AllergenCode[];
  dietMismatches: DietCode[];
}

export function evaluateMeal(meal: Pick<Meal, 'allergens' | 'mayContain' | 'diets' | 'status'>, profile: HealthProfile): SafetyVerdict {
  const declared = expandAllergens(meal.allergens);
  const traces = expandAllergens(meal.mayContain);
  const mine = profile.allergens.map((a) => a.code);

  const conflicts = mine.filter((c) => declared.has(c));
  // Les traces excluent toujours pour une allergie ; pour une intolérance seulement si strictTraces.
  const traceConflicts = profile.allergens
    .filter((a) => traces.has(a.code) && !declared.has(a.code))
    .filter((a) => a.severity === 'allergy' || profile.strictTraces)
    .map((a) => a.code);

  const dietMismatches = profile.diets.filter((d) => !meal.diets.includes(d));

  // Un plat non publié n'a pas de déclaration validée : jamais « sûr ».
  const validated = meal.status === 'published' || meal.status === 'reserved';

  return {
    safe: validated && conflicts.length === 0 && traceConflicts.length === 0 && dietMismatches.length === 0,
    conflicts,
    traceConflicts,
    dietMismatches,
  };
}

export const isMealSafe = (meal: Meal, profile: HealthProfile) => evaluateMeal(meal, profile).safe;
