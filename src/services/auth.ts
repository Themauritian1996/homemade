/**
 * Authentification — Supabase Auth (courriel + mot de passe, OAuth Google/Apple en phase 2).
 * Bêta fermée : l'inscription exige un code d'invitation, vérifié et consommé côté serveur
 * par le trigger `handle_new_user` (l'app ne fait qu'une vérification préalable pour l'ergonomie).
 * En mode démo, crée une session locale fictive.
 */
import { Alert } from 'react-native';
import { DEMO_MODE } from '@/lib/config';
import { requireSupabase } from '@/lib/supabase';
import { SessionUser, useApp } from '@/store/app';
import { DEMO_USER_ID } from '@/data/mock';
import type { HealthProfile } from '@/types';

const toSessionUser = (u: { id: string; email?: string; user_metadata?: Record<string, unknown> }): SessionUser => ({
  id: u.id,
  email: u.email ?? '',
  displayName: (u.user_metadata?.display_name as string) ?? u.email?.split('@')[0] ?? 'Membre',
});

export interface InviteStatus {
  required: boolean;
  valid: boolean;
}

/** Vérification préalable du code (le serveur revérifie de toute façon à la création du compte). */
export async function checkInviteCode(code: string): Promise<InviteStatus> {
  if (DEMO_MODE) return { required: false, valid: true };
  const { data, error } = await requireSupabase().rpc('invite_status', { p_code: code });
  // Base pas encore mise à jour (fonction absente) : le serveur décidera seul à la création du compte.
  if (error?.code === 'PGRST202') return { required: false, valid: true };
  if (error) throw error;
  return data as InviteStatus;
}

export async function signUp(params: { email: string; password: string; displayName: string; inviteCode: string }) {
  if (DEMO_MODE) {
    useApp.getState().resetSession();
    useApp.getState().setUser({ id: DEMO_USER_ID, email: params.email, displayName: params.displayName });
    return { needsEmailConfirmation: false };
  }
  const { data, error } = await requireSupabase().auth.signUp({
    email: params.email,
    password: params.password,
    // Lus par le trigger `handle_new_user` : prénom du profil + code d'invitation consommé.
    options: { data: { display_name: params.displayName, invite_code: params.inviteCode.trim() }, emailRedirectTo: 'homemade://auth/callback' },
  });
  if (error) throw error;
  // La session est ouverte par listenToAuth (après lecture de l'état serveur).
  return { needsEmailConfirmation: !data.session };
}

export async function signIn(email: string, password: string) {
  if (DEMO_MODE) {
    useApp.getState().setUser({ id: DEMO_USER_ID, email, displayName: email.split('@')[0] || 'Vous' });
    return;
  }
  const { error } = await requireSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function sendPasswordReset(email: string) {
  if (DEMO_MODE) return;
  const { error } = await requireSupabase().auth.resetPasswordForEmail(email, { redirectTo: 'homemade://auth/reset' });
  if (error) throw error;
}

export async function signOut() {
  if (!DEMO_MODE)
    await requireSupabase()
      .auth.signOut()
      .catch(() => {});
  useApp.getState().resetSession();
}

interface Bootstrap {
  onboarded: boolean;
  deleted: boolean;
  health: HealthProfile;
}

/**
 * À chaque ouverture de session : le serveur fait foi pour le profil santé et l'état « onboardé »
 * (ils suivent le compte, pas le téléphone). Un compte supprimé est déconnecté.
 * `open` : ouvre la session dans l'app une fois l'état connu (nouveau compte sur ce téléphone).
 */
async function bootstrapSession(user: SessionUser, open: boolean) {
  const { data, error } = await requireSupabase().rpc('session_bootstrap');
  const store = useApp.getState();
  if (!error && data) {
    const b = data as Bootstrap;
    if (b.deleted) {
      await signOut();
      Alert.alert('Compte supprimé', 'Ce compte a été supprimé. Créez un nouveau compte pour utiliser Homemade.');
      return;
    }
    store.setHealth(b.health);
    store.setOnboarded(b.onboarded);
  }
  if (open) store.setUser(user);
}

/** Synchronise le store avec la session Supabase (au démarrage + à chaque changement). */
export function listenToAuth(): () => void {
  if (DEMO_MODE) return () => {};
  const sb = requireSupabase();
  const { data } = sb.auth.onAuthStateChange((event, session) => {
    const store = useApp.getState();
    if (!session) {
      if (store.user) store.resetSession();
      return;
    }
    const user = toSessionUser(session.user);
    const known = store.user?.id === user.id;
    if (!known && store.user) store.resetSession(); // changement de compte : on repart d'un état vierge
    if (known) store.setUser(user);
    if (!known || event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
      // Différé hors du callback (recommandation supabase-js : pas d'appel Supabase bloquant ici).
      setTimeout(() => bootstrapSession(user, !known).catch(() => useApp.getState().setUser(user)), 0);
    }
  });
  return () => data.subscription.unsubscribe();
}
