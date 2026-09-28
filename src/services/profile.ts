/** Profil santé : stocké dans `user_allergens` / `user_diets` (données sensibles — Loi 25). */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import type { HealthProfile } from '@/types';

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

/** Onboarding Stripe Connect du Cooker : renvoie l'URL de la page Stripe (identité + compte bancaire). */
export async function startPayoutOnboarding(): Promise<string | null> {
  if (DEMO_MODE) return null;
  const { data, error } = await requireSupabase().functions.invoke<{ url: string }>('stripe-connect-onboard', { body: {} });
  if (error) throw error;
  return data?.url ?? null;
}
