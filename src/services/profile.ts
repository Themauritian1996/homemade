/** Profil santé : stocké dans `user_allergens` / `user_diets` (données sensibles — Loi 25). */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import type { HealthProfile, PublicProfile } from '@/types';
import { demoProfile } from '@/data/mock';

export async function saveHealthProfile(h: HealthProfile) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().rpc('set_health_profile', {
    p_allergens: h.allergens,
    p_diets: h.diets,
    p_strict_traces: h.strictTraces,
  });
  if (error) throw error;
}

export async function loadHealthProfile(): Promise<HealthProfile | null> {
  if (DEMO_MODE) return null;
  const { data, error } = await requireSupabase().rpc('get_health_profile');
  if (error) throw error;
  return (data as HealthProfile) ?? null;
}

/** Mon profil public (notes et badges calculés par le serveur uniquement). */
export async function fetchMyProfile(userId: string): Promise<PublicProfile> {
  if (DEMO_MODE) return demoProfile;
  const { data, error } = await requireSupabase()
    .from('profiles')
    .select('id, display_name, avatar_url, neighborhood, bio, cooker_rating_avg, cooker_rating_count, eater_rating_avg, eater_rating_count, meals_shared_count, cooker_verified_at, created_at')
    .eq('id', userId)
    .single();
  if (error) throw error;
  const r = data as Record<string, any>;
  return {
    id: r.id,
    displayName: r.display_name,
    avatarUrl: r.avatar_url ?? undefined,
    neighborhood: r.neighborhood ?? undefined,
    bio: r.bio ?? undefined,
    cookerRating: r.cooker_rating_avg == null ? null : Number(r.cooker_rating_avg),
    cookerRatingCount: r.cooker_rating_count,
    eaterRating: r.eater_rating_avg == null ? null : Number(r.eater_rating_avg),
    eaterRatingCount: r.eater_rating_count,
    badges: r.meals_shared_count >= 25 ? ['Zéro gaspi'] : [],
    isVerified: r.cooker_verified_at != null,
    memberSince: r.created_at,
    mealsShared: r.meals_shared_count,
  };
}
