/**
 * Repas : fil filtré, détail, publication.
 * Le filtrage allergènes est fait CÔTÉ SERVEUR par la RPC `feed_meals` (auth.uid() ⇒ profil santé).
 */
import { DEMO_MODE } from '@/lib/config';
import { distanceKm } from '@/lib/format';
import { isMealSafe } from '@/lib/safety';
import { requireSupabase } from '@/lib/supabase';
import { meals as demoMeals, reviewsByCooker } from '@/data/mock';
import type { AllergenCode, CuisineCode, DietCode } from '@/data/allergens';
import type { FeedFilters, GeoPoint, HealthProfile, Meal, MealIngredient, MealMode, Review } from '@/types';
import type { PortionUnit } from '@/data/portions';

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Le SQL renvoie des chemins Storage ; on les convertit en URL publiques (bucket `meal-photos`, servi par CDN). */
export const photoUrl = (pathOrUrl: string) =>
  pathOrUrl.startsWith('http') ? pathOrUrl : requireSupabase().storage.from('meal-photos').getPublicUrl(pathOrUrl).data.publicUrl;

const normalizeMeal = (m: Meal): Meal => ({ ...m, photos: m.photos.map(photoUrl) });

export interface FeedResult {
  meals: Meal[];
  /** Nombre de plats masqués pour raisons de santé (transparence envers l'utilisateur). */
  hiddenForHealth: number;
}

export async function fetchFeed(filters: FeedFilters, at: GeoPoint, health: HealthProfile): Promise<FeedResult> {
  if (DEMO_MODE) {
    await delay(250);
    const withDistance = demoMeals.map((m) => ({ ...m, distanceKm: distanceKm(at, m.pickupLocation) }));
    const inScope = withDistance.filter(
      (m) =>
        m.distanceKm! <= filters.radiusKm &&
        (filters.cuisines.length === 0 || filters.cuisines.includes(m.cuisine)) &&
        filters.diets.every((d) => m.diets.includes(d)) &&
        (filters.maxPriceCents == null || m.priceCents == null || m.priceCents <= filters.maxPriceCents) &&
        (filters.mode === 'all' || m.mode === filters.mode || m.mode === 'both'),
    );
    const safe = inScope.filter((m) => isMealSafe(m, health));
    return { meals: sortMeals(safe, filters.sort), hiddenForHealth: inScope.length - safe.length };
  }

  const { data, error } = await requireSupabase().rpc('feed_meals', {
    p_lat: at.latitude,
    p_lng: at.longitude,
    p_radius_m: Math.round(filters.radiusKm * 1000),
    p_cuisines: filters.cuisines.length ? filters.cuisines : null,
    p_diets: filters.diets.length ? filters.diets : null,
    p_max_price_cents: filters.maxPriceCents,
    p_mode: filters.mode,
    p_sort: filters.sort,
    p_limit: 60,
  });
  if (error) throw error;
  const payload = data as { meals: Meal[]; hidden_for_health: number };
  return { meals: (payload.meals ?? []).map(normalizeMeal), hiddenForHealth: payload.hidden_for_health ?? 0 };
}

function sortMeals(list: Meal[], sort: FeedFilters['sort']) {
  const copy = [...list];
  switch (sort) {
    case 'rating':
      return copy.sort((a, b) => (b.cooker.cookerRating ?? 0) - (a.cooker.cookerRating ?? 0));
    case 'newest':
      return copy.sort((a, b) => b.preparedAt.localeCompare(a.preparedAt));
    case 'price':
      return copy.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
    default:
      return copy.sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }
}

export async function fetchMeal(id: string): Promise<Meal | null> {
  if (DEMO_MODE) return demoMeals.find((m) => m.id === id) ?? null;
  const { data, error } = await requireSupabase().rpc('get_meal', { p_meal_id: id });
  if (error) throw error;
  return data ? normalizeMeal(data as Meal) : null;
}

export async function fetchCookerReviews(cookerId: string): Promise<Review[]> {
  if (DEMO_MODE) return reviewsByCooker[cookerId] ?? [];
  const { data, error } = await requireSupabase().rpc('get_reviews_for_user', { p_user_id: cookerId, p_role: 'cooker', p_limit: 20 });
  if (error) throw error;
  return (data as Review[]) ?? [];
}

export interface PublishMealInput {
  /** Id de l'analyse IA (table ai_analyses) — sert à mesurer l'écart IA vs validation humaine. */
  aiAnalysisId?: string;
  photoPaths: string[];
  title: string;
  description: string;
  cuisine: CuisineCode;
  ingredients: MealIngredient[];
  /** Ensemble final validé par le Cooker (ingrédients + allergènes ajoutés manuellement). */
  declaredAllergens: AllergenCode[];
  mayContain: AllergenCode[];
  diets: DietCode[];
  mode: MealMode;
  priceCents: number | null;
  portions: number;
  availableHours: number;
  pickup: GeoPoint;
  pickupArea: string;
  /** Case « J'ai vérifié la liste des ingrédients et des allergènes » — obligatoire. */
  cookerAttestation: boolean;
  /** Ce que contient une portion (défaut : 1 assiette). */
  portionQty?: number;
  portionUnit?: PortionUnit;
  /** Origine de la photo (indice de fraîcheur). */
  photoSource?: 'camera' | 'library';
  photoTakenAt?: string | null;
}

/**
 * Publication atomique via RPC `publish_meal_with_details` (= `publish_meal` + portion + origine de la photo, une
 * seule transaction) : insère le plat, ses ingrédients, recalcule `meal_allergens` et passe le statut à `published`
 * seulement si l'attestation est présente.
 */
export async function publishMeal(input: PublishMealInput): Promise<{ id: string }> {
  if (!input.cookerAttestation) throw new Error('La validation des allergènes par le Cooker est obligatoire.');
  if (DEMO_MODE) {
    await delay(700);
    return { id: `demo-${Date.now()}` };
  }
  const { data, error } = await requireSupabase().rpc('publish_meal_with_details', { p_payload: input });
  if (error) throw error;
  return { id: data as string };
}

/** Origine et date de la photo (appareil photo / galerie + EXIF) : indice de fraîcheur affiché aux voisins. */
export async function setMealPhotoMeta(mealId: string, takenAt: string | null, source: 'camera' | 'library'): Promise<void> {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().rpc('set_meal_photo_meta', { p_meal_id: mealId, p_taken_at: takenAt, p_source: source });
  if (error) throw error;
}

/** Mes plats publiés proposables en échange (mode « échange » ou « les deux »). */
export async function fetchMySwappableMeals(userId: string): Promise<Meal[]> {
  if (DEMO_MODE) return demoMeals.filter((m) => m.mode !== 'sale').slice(0, 3);
  const { data, error } = await requireSupabase()
    .from('meals')
    .select('id')
    .eq('cooker_id', userId)
    .eq('status', 'published')
    .in('mode', ['swap', 'both'])
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  const meals = await Promise.all((data ?? []).map((r: { id: string }) => fetchMeal(r.id)));
  return meals.filter((m): m is Meal => m !== null);
}
