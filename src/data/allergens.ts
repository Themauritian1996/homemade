/**
 * Référentiel canonique des allergènes — aligné sur les allergènes prioritaires de Santé Canada
 * (+ gluten séparé du blé). Ce fichier DOIT rester synchronisé avec `supabase/seed.sql`
 * (table `allergens`). Le code (`id`) est la clé partagée front / back / IA.
 */
export type AllergenCode =
  | 'peanut'
  | 'tree_nut'
  | 'sesame'
  | 'milk'
  | 'egg'
  | 'fish'
  | 'crustacean'
  | 'mollusc'
  | 'soy'
  | 'wheat'
  | 'gluten'
  | 'mustard'
  | 'sulphite';

export interface Allergen {
  id: AllergenCode;
  fr: string;
  en: string;
  emoji: string;
}

export const ALLERGENS: Allergen[] = [
  { id: 'peanut', fr: 'Arachides', en: 'Peanuts', emoji: '🥜' },
  { id: 'tree_nut', fr: 'Noix', en: 'Tree nuts', emoji: '🌰' },
  { id: 'sesame', fr: 'Sésame', en: 'Sesame', emoji: '⚪' },
  { id: 'milk', fr: 'Lait', en: 'Milk', emoji: '🥛' },
  { id: 'egg', fr: 'Œufs', en: 'Eggs', emoji: '🥚' },
  { id: 'fish', fr: 'Poisson', en: 'Fish', emoji: '🐟' },
  { id: 'crustacean', fr: 'Crustacés', en: 'Crustaceans', emoji: '🦐' },
  { id: 'mollusc', fr: 'Mollusques', en: 'Molluscs', emoji: '🦪' },
  { id: 'soy', fr: 'Soya', en: 'Soy', emoji: '🫘' },
  { id: 'wheat', fr: 'Blé', en: 'Wheat', emoji: '🌾' },
  { id: 'gluten', fr: 'Gluten', en: 'Gluten', emoji: '🍞' },
  { id: 'mustard', fr: 'Moutarde', en: 'Mustard', emoji: '🟡' },
  { id: 'sulphite', fr: 'Sulfites', en: 'Sulphites', emoji: '🍷' },
];

export const allergenById = (id: AllergenCode) => ALLERGENS.find((a) => a.id === id)!;

export type DietCode = 'vegetarian' | 'vegan' | 'halal' | 'kosher' | 'pescatarian' | 'gluten_free' | 'dairy_free';

export const DIETS: { id: DietCode; fr: string; en: string }[] = [
  { id: 'vegetarian', fr: 'Végétarien', en: 'Vegetarian' },
  { id: 'vegan', fr: 'Végane', en: 'Vegan' },
  { id: 'halal', fr: 'Halal', en: 'Halal' },
  { id: 'kosher', fr: 'Casher', en: 'Kosher' },
  { id: 'pescatarian', fr: 'Pescétarien', en: 'Pescatarian' },
  { id: 'gluten_free', fr: 'Sans gluten', en: 'Gluten-free' },
  { id: 'dairy_free', fr: 'Sans lactose', en: 'Dairy-free' },
];

export type CuisineCode =
  | 'quebecois'
  | 'italian'
  | 'asian'
  | 'indian'
  | 'mexican'
  | 'middle_eastern'
  | 'african'
  | 'caribbean'
  | 'mediterranean'
  | 'healthy_bowl'
  | 'dessert'
  | 'other';

export const CUISINES: { id: CuisineCode; fr: string; en: string; emoji: string }[] = [
  { id: 'quebecois', fr: 'Québécois', en: 'Québécois', emoji: '⚜️' },
  { id: 'italian', fr: 'Italien', en: 'Italian', emoji: '🍝' },
  { id: 'asian', fr: 'Asiatique', en: 'Asian', emoji: '🥢' },
  { id: 'indian', fr: 'Indien', en: 'Indian', emoji: '🍛' },
  { id: 'mexican', fr: 'Mexicain', en: 'Mexican', emoji: '🌮' },
  { id: 'middle_eastern', fr: 'Moyen-Orient', en: 'Middle Eastern', emoji: '🧆' },
  { id: 'african', fr: 'Africain', en: 'African', emoji: '🍲' },
  { id: 'caribbean', fr: 'Caribéen', en: 'Caribbean', emoji: '🌴' },
  { id: 'mediterranean', fr: 'Méditerranéen', en: 'Mediterranean', emoji: '🫒' },
  { id: 'healthy_bowl', fr: 'Bol santé', en: 'Healthy bowl', emoji: '🥗' },
  { id: 'dessert', fr: 'Dessert', en: 'Dessert', emoji: '🍰' },
  { id: 'other', fr: 'Autre', en: 'Other', emoji: '🍽️' },
];

export const cuisineById = (id: CuisineCode) => CUISINES.find((c) => c.id === id) ?? CUISINES[CUISINES.length - 1];
