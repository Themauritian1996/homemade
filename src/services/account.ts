/**
 * Compte et vie de la bêta : espace Cooker, invitations, paramètres, commentaires, signalements,
 * droits Loi 25 (export, suppression). Écritures sensibles via RPC ; colonnes cosmétiques en direct (RLS).
 */
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { meals as demoMeals } from '@/data/mock';
import type { Meal } from '@/types';
import { photoUrl } from './meals';
import { signOut } from './auth';

export const appVersion = () => {
  const v = Constants.expoConfig?.version ?? '1.0.0';
  const build = Constants.expoConfig?.extra?.buildNumber as number | null | undefined;
  return build ? `${v} (${build})` : v;
};

// ───────────────────────────── Espace Cooker
export type MyMeal = Meal & { activeOrders: number };

export async function fetchMyMeals(): Promise<MyMeal[]> {
  if (DEMO_MODE) return demoMeals.slice(0, 2).map((m, i) => ({ ...m, activeOrders: i === 0 ? 1 : 0 }));
  const { data, error } = await requireSupabase().rpc('my_meals');
  if (error) throw error;
  return ((data as MyMeal[]) ?? []).map((m) => ({ ...m, photos: m.photos.map(photoUrl) }));
}

export async function withdrawMeal(mealId: string) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().rpc('withdraw_meal', { p_meal_id: mealId });
  if (error) throw error;
}

// ───────────────────────────── Invitations
export interface MyInvite {
  code: string;
  uses: number;
  maxUses: number;
  remaining: number;
}

export async function fetchMyInvite(): Promise<MyInvite> {
  if (DEMO_MODE) return { code: 'HM-DEMO42', uses: 1, maxUses: 5, remaining: 4 };
  const { data, error } = await requireSupabase().rpc('my_invite_code');
  if (error) throw error;
  return data as MyInvite;
}

// ───────────────────────────── Profil & préférences
export interface EditableProfile {
  displayName: string;
  neighborhood: string;
  bio: string;
  avatarUrl?: string;
}

export interface Settings {
  defaultRadiusKm: number;
  notifyMessages: boolean;
  notifyNewNearby: boolean;
  /** Afficher le texte des messages dans les notifications (sinon « Nouveau message »). */
  notifyPreview: boolean;
}

export async function loadAccount(userId: string): Promise<{ profile: EditableProfile; settings: Settings }> {
  if (DEMO_MODE) {
    return {
      profile: { displayName: '', neighborhood: 'Plateau-Mont-Royal', bio: '' },
      settings: { defaultRadiusKm: 5, notifyMessages: true, notifyNewNearby: true, notifyPreview: false },
    };
  }
  const sb = requireSupabase();
  const [p, s] = await Promise.all([
    sb.from('profiles').select('display_name, neighborhood, bio, avatar_url').eq('id', userId).single(),
    sb.from('user_settings').select('default_radius_m, notify_messages, notify_new_nearby, notify_preview').eq('user_id', userId).single(),
  ]);
  if (p.error) throw p.error;
  if (s.error) throw s.error;
  return {
    profile: { displayName: p.data.display_name, neighborhood: p.data.neighborhood ?? '', bio: p.data.bio ?? '', avatarUrl: p.data.avatar_url ?? undefined },
    settings: {
      defaultRadiusKm: Math.round(s.data.default_radius_m / 1000),
      notifyMessages: s.data.notify_messages,
      notifyNewNearby: s.data.notify_new_nearby,
      notifyPreview: Boolean(s.data.notify_preview),
    },
  };
}

export async function saveProfile(userId: string, p: EditableProfile) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase()
    .from('profiles')
    .update({
      display_name: p.displayName.trim().slice(0, 40),
      neighborhood: p.neighborhood.trim().slice(0, 80) || null,
      bio: p.bio.trim().slice(0, 400) || null,
    })
    .eq('id', userId);
  if (error) throw error;
}

export async function saveSettings(userId: string, s: Settings) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase()
    .from('user_settings')
    .update({ default_radius_m: Math.round(s.defaultRadiusKm * 1000), notify_messages: s.notifyMessages, notify_new_nearby: s.notifyNewNearby, notify_preview: s.notifyPreview })
    .eq('user_id', userId);
  if (error) throw error;
}

/** Photo de profil : bucket public `avatars/<uid>/…` (nom unique, l'ancienne est supprimée). */
export async function uploadAvatar(userId: string, localUri: string, previous?: string): Promise<string | undefined> {
  if (DEMO_MODE) return localUri;
  const sb = requireSupabase();
  const path = `${userId}/${Date.now()}.jpg`;
  const body = await (await fetch(localUri)).arrayBuffer();
  const up = await sb.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg' });
  if (up.error) throw up.error;
  const url = sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  const { error } = await sb.from('profiles').update({ avatar_url: url }).eq('id', userId);
  if (error) throw error;
  const old = previous?.split('/avatars/')[1];
  if (old)
    await sb.storage
      .from('avatars')
      .remove([old])
      .catch(() => {});
  return url;
}

// ───────────────────────────── Commentaires & signalements
export type FeedbackKind = 'bug' | 'idea' | 'praise' | 'other';

export async function sendFeedback(userId: string, f: { kind: FeedbackKind; message: string; screen?: string }) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase()
    .from('beta_feedback')
    .insert({
      user_id: userId,
      kind: f.kind,
      message: f.message.trim().slice(0, 2000),
      screen: f.screen?.slice(0, 60) ?? null,
      app_version: appVersion(),
      platform: Platform.OS,
    });
  if (error) throw error;
}

export type ReportReason = 'allergen_incident' | 'hygiene' | 'no_show' | 'misleading' | 'fraud' | 'off_platform' | 'harassment' | 'other';

/** Un signalement « incident allergène » ou « hygiène » suspend le plat immédiatement (trigger serveur). */
export async function sendReport(userId: string, r: { reason: ReportReason; details: string; mealId?: string; subjectId?: string; orderId?: string }) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase()
    .from('reports')
    .insert({
      reporter_id: userId,
      reason: r.reason,
      details: r.details.trim().slice(0, 2000) || null,
      meal_id: r.mealId ?? null,
      subject_id: r.subjectId ?? null,
      order_id: r.orderId ?? null,
    });
  if (error) throw error;
}

// ───────────────────────────── Loi 25
export async function exportMyData(): Promise<string> {
  if (DEMO_MODE) return JSON.stringify({ exported_at: new Date().toISOString(), note: 'Mode démo : aucune donnée enregistrée.' }, null, 2);
  const { data, error } = await requireSupabase().rpc('export_my_data');
  if (error) throw error;
  return JSON.stringify(data, null, 2);
}

/**
 * Données serveur anonymisées (refus possible : commande payante en cours), puis photos publiques
 * (plats, avatar) effacées tant que la session est encore ouverte, puis déconnexion.
 */
export async function deleteMyAccount(userId: string) {
  if (!DEMO_MODE) {
    const sb = requireSupabase();
    const { error } = await sb.rpc('delete_my_account');
    if (error) throw error;
    for (const bucket of ['meal-photos', 'avatars']) {
      const { data } = await sb.storage.from(bucket).list(userId, { limit: 1000 });
      const files = (data ?? []).filter((f) => f.id).map((f) => `${userId}/${f.name}`);
      if (files.length)
        await sb.storage
          .from(bucket)
          .remove(files)
          .catch(() => {});
    }
  }
  await signOut();
}
