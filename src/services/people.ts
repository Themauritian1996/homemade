/** Voisins : page publique (notes par critère, avis, plats), voisins favoris. */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { demoProfile, meals as demoMeals, reviewsByCooker } from '@/data/mock';
import type { Meal, PersonPage, PublicProfile, Review, ReviewSummary } from '@/types';
import { photoUrl } from './meals';

export type ReviewRole = 'cooker' | 'eater';

const EMPTY: ReviewSummary = { count: 0, average: null, distribution: {}, criteria: {}, tags: {} };

const withPhotos = (m: Meal): Meal => ({ ...m, photos: m.photos.map(photoUrl) });

export async function fetchPersonPage(id: string): Promise<PersonPage | null> {
  if (DEMO_MODE) {
    const cooker = demoMeals.find((m) => m.cooker.id === id)?.cooker ?? demoProfile;
    const reviews = reviewsByCooker[id] ?? [];
    return {
      profile: cooker,
      isFavorite: false,
      tradedWith: true,
      cookerSummary: {
        ...EMPTY,
        count: reviews.length,
        average: cooker.cookerRating,
        distribution: reviews.reduce<Record<string, number>>((d, r) => ({ ...d, [String(r.rating)]: (d[String(r.rating)] ?? 0) + 1 }), {}),
        criteria: { taste: 4.9, hygiene: 4.8, accuracy: 4.7, punctuality: 4.6 },
      },
      eaterSummary: EMPTY,
      meals: demoMeals.filter((m) => m.cooker.id === id),
    };
  }
  const { data, error } = await requireSupabase().rpc('person_page', { p_person_id: id });
  if (error) throw error;
  if (!data) return null;
  const page = data as PersonPage;
  return { ...page, meals: (page.meals ?? []).map(withPhotos) };
}

export async function fetchReviews(userId: string, role: ReviewRole): Promise<Review[]> {
  if (DEMO_MODE) return role === 'cooker' ? (reviewsByCooker[userId] ?? []) : [];
  const { data, error } = await requireSupabase().rpc('get_reviews_for_user', { p_user_id: userId, p_role: role, p_limit: 50 });
  if (error) throw error;
  return (data as Review[]) ?? [];
}

/** Ajoute ou retire un voisin favori ; renvoie le nouvel état. */
export async function toggleFavoritePerson(id: string): Promise<boolean> {
  if (DEMO_MODE) return true;
  const { data, error } = await requireSupabase().rpc('toggle_favorite_person', { p_person_id: id });
  if (error) throw error;
  return Boolean(data);
}

export async function fetchFavoritePeople(): Promise<(PublicProfile & { activeMeals: number })[]> {
  if (DEMO_MODE) return [];
  const { data, error } = await requireSupabase().rpc('my_favorite_people');
  if (error) throw error;
  return (data as (PublicProfile & { activeMeals: number })[]) ?? [];
}
