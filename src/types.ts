/** Types de domaine — miroir du schéma Postgres (`supabase/migrations`). */
import type { AllergenCode, CuisineCode, DietCode } from '@/data/allergens';

export type MealMode = 'sale' | 'swap' | 'both';
export type MealStatus = 'draft' | 'published' | 'reserved' | 'sold_out' | 'expired' | 'archived';
export type AllergenSeverity = 'allergy' | 'intolerance';

export interface GeoPoint {
  latitude: number;
  longitude: number;
}

export interface PublicProfile {
  id: string;
  displayName: string;
  avatarUrl?: string;
  neighborhood?: string;
  bio?: string;
  cookerRating: number | null;
  cookerRatingCount: number;
  eaterRating: number | null;
  eaterRatingCount: number;
  badges: string[];
  isVerified: boolean;
  memberSince: string;
  /** Repas partagés (échanges + ventes complétés). */
  mealsShared?: number;
}

export interface MealIngredient {
  name: string;
  /** Allergènes portés par cet ingrédient (validés par le Cooker). */
  allergens: AllergenCode[];
  source: 'ai' | 'cooker';
}

export interface Meal {
  id: string;
  cooker: PublicProfile;
  title: string;
  description: string;
  cuisine: CuisineCode;
  photos: string[];
  ingredients: MealIngredient[];
  /** Ensemble final déclaré = union(allergènes des ingrédients) ∪ traces possibles. */
  allergens: AllergenCode[];
  mayContain: AllergenCode[];
  diets: DietCode[];
  mode: MealMode;
  priceCents: number | null;
  currency: 'CAD';
  portionsTotal: number;
  portionsLeft: number;
  preparedAt: string;
  availableUntil: string;
  pickupLocation: GeoPoint;
  pickupArea: string;
  distanceKm?: number;
  status: MealStatus;
  aiAssisted: boolean;
}

export interface HealthProfile {
  allergens: { code: AllergenCode; severity: AllergenSeverity }[];
  diets: DietCode[];
  /** Si vrai : exclure aussi les plats « peut contenir des traces de ». */
  strictTraces: boolean;
}

export interface FeedFilters {
  radiusKm: number;
  cuisines: CuisineCode[];
  diets: DietCode[];
  maxPriceCents: number | null;
  mode: 'all' | 'sale' | 'swap';
  sort: 'distance' | 'rating' | 'newest' | 'price';
}

export const DEFAULT_FILTERS: FeedFilters = {
  radiusKm: 5,
  cuisines: [],
  diets: [],
  maxPriceCents: null,
  mode: 'all',
  sort: 'distance',
};

/** Résultat brut de l'analyse IA d'une photo (contrat de l'Edge Function `analyze-meal`). */
export interface AiMealAnalysis {
  isFood: boolean;
  title: string;
  description: string;
  cuisine: CuisineCode;
  ingredients: { name: string; confidence: number; allergens: AllergenCode[] }[];
  allergens: { code: AllergenCode; confidence: number; reason: string }[];
  diets: DietCode[];
  warnings: string[];
  modelVersion: string;
}

/** Lecture d'une étiquette ou d'une recette (OCR IA) — contrat de `analyze-meal` avec `task: 'ocr'`. */
export interface AiTextScan {
  source: 'label' | 'recipe' | 'other' | 'none';
  /** Transcription du texte utile, à comparer avec la photo. */
  text: string;
  title: string;
  ingredients: { name: string; allergens: AllergenCode[] }[];
  /** Ingrédients statistiquement présents dans ce plat mais absents du texte : proposés (cochés par défaut), le Cooker retire ce qui ne s'applique pas. */
  likelyIngredients?: { name: string; allergens: AllergenCode[]; confidence: number }[];
  /** Allergènes présents (mentions « Contient » + ingrédients), implications incluses. */
  contains: AllergenCode[];
  /** Mentions de précaution (« Peut contenir »). */
  mayContain: AllergenCode[];
  confidence: number;
  warnings: string[];
  modelVersion: string;
}

export type OrderKind = 'purchase' | 'swap';
export type OrderStatus =
  | 'requested'
  | 'accepted'
  | 'paid'
  | 'ready'
  | 'picked_up'
  | 'completed'
  | 'cancelled'
  | 'declined'
  | 'disputed';

export interface Order {
  id: string;
  kind: OrderKind;
  meal: Meal;
  eaterId: string;
  cookerId: string;
  quantity: number;
  totalCents: number | null;
  offeredMeal?: Meal;
  status: OrderStatus;
  pickupAt?: string;
  conversationId: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  orderId?: string;
  mealTitle: string;
  mealPhoto?: string;
  other: PublicProfile;
  lastMessage: string;
  lastMessageAt: string;
  unread: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  kind: 'text' | 'system';
  createdAt: string;
  /** Coordonnées ou paiement hors app masqués par le serveur. */
  masked?: boolean;
}

export interface Review {
  id: string;
  author: PublicProfile;
  rating: number;
  comment: string;
  tags: string[];
  createdAt: string;
}
