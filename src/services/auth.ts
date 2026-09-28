/**
 * Authentification — Supabase Auth (courriel + mot de passe, OAuth Google/Apple en phase 2).
 * En mode démo, crée une session locale fictive.
 */
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { SessionUser, useApp } from '@/store/app';
import { DEMO_USER_ID } from '@/data/mock';
import { loadHealthProfile } from './profile';

/** Le profil santé fait foi côté serveur : on le recharge à chaque ouverture de session. */
const syncHealth = () => loadHealthProfile().then((h) => h && useApp.getState().setHealth(h)).catch(() => {});

const toSessionUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): SessionUser => ({
  id: u.id,
  email: u.email ?? '',
  displayName: (u.user_metadata?.display_name as string) ?? u.email?.split('@')[0] ?? 'Membre',
});

export async function signUp(params: { email: string; password: string; displayName: string }) {
  if (DEMO_MODE) {
    useApp.getState().setUser({ id: DEMO_USER_ID, email: params.email, displayName: params.displayName });
    return { needsEmailConfirmation: false };
  }
  const { data, error } = await requireSupabase().auth.signUp({
    email: params.email,
    password: params.password,
    // `display_name` est lu par le trigger `handle_new_user` pour créer la ligne `profiles`.
    options: { data: { display_name: params.displayName }, emailRedirectTo: 'homemade://auth/callback' },
  });
  if (error) throw error;
  if (data.user && data.session) useApp.getState().setUser(toSessionUser(data.user));
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  if (DEMO_MODE) {
    useApp.getState().setUser({ id: DEMO_USER_ID, email, displayName: email.split('@')[0] || 'Vous' });
    return;
  }
  const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
  useApp.getState().setUser(toSessionUser(data.user));
}

export async function sendPasswordReset(email: string) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: 'homemade://auth/reset' });
  if (error) throw error;
}

export async function signOut() {
  if (!DEMO_MODE) await requireSupabase().auth.signOut();
  useApp.getState().setUser(null);
}

/** Synchronise le store avec la session Supabase (au démarrage + à chaque changement). */
export function listenToAuth(): () => void {
  if (DEMO_MODE) return () => {};
  const sb = requireSupabase();
  sb.auth.getSession().then(({ data }) => useApp.getState().setUser(data.session ? toSessionUser(data.session.user) : null));
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    useApp.getState().setUser(session ? toSessionUser(session.user) : null);
    if (session && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION')) syncHealth();
  });
  return () => data.subscription.unsubscribe();
}
