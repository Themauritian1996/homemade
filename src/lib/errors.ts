/**
 * Messages d'erreur lisibles (français québécois) à partir des erreurs Supabase Auth, des codes
 * levés par les fonctions SQL (ex. « HEALTH_PROFILE_CONFLICT: … ») et des erreurs réseau.
 */
const MESSAGES: [RegExp, string][] = [
  [
    /INVITE_CODE_INVALID|Database error saving new user/i,
    'Code d’invitation invalide, expiré ou déjà utilisé au maximum. Demandez un nouveau code à la personne qui vous a invité.',
  ],
  [/User already registered|already been registered/i, 'Un compte existe déjà avec ce courriel. Connectez-vous plutôt.'],
  [/Invalid login credentials/i, 'Courriel ou mot de passe incorrect.'],
  [/Email not confirmed/i, 'Confirmez d’abord votre courriel (lien reçu à l’inscription).'],
  [/rate limit|too many requests|429/i, 'Trop de tentatives. Patientez quelques minutes puis réessayez.'],
  [/Password should be at least/i, 'Le mot de passe doit contenir au moins 8 caractères.'],
  [/HEALTH_PROFILE_CONFLICT/, 'Ce plat n’est pas compatible avec votre profil santé.'],
  [/OFFER_CONFLICTS_WITH_COOKER_HEALTH_PROFILE/, 'Votre plat n’est pas compatible avec le profil santé de ce Cooker. Proposez-en un autre.'],
  [/STRIPE_ONBOARDING_REQUIRED/, 'La vente n’est pas encore activée pour votre compte. Choisissez le mode Échange.'],
  [/DIET_CONFLICT/, 'Un régime coché est incompatible avec les allergènes déclarés (ex. « végane » avec du lait).'],
  [/ACTIVE_ORDERS/, 'Une commande ou un échange accepté est en cours pour ce plat : terminez-le avant de retirer l’annonce.'],
  [/ACTIVE_PAID_ORDERS/, 'Vous avez une commande payante en cours. Terminez-la ou annulez-la avant de supprimer votre compte.'],
  [/MEAL_UNAVAILABLE|MEAL_NOT_SWAPPABLE|SWAP_MEAL_NO_LONGER_AVAILABLE|NOT_ENOUGH_PORTIONS/, 'Ce plat n’est plus disponible.'],
  [/OFFERED_MEAL_INVALID/, 'Le plat proposé n’est plus disponible. Choisissez-en un autre.'],
  [/INVALID_TRANSITION/, 'Cette action n’est plus possible : la commande a changé d’état. Rafraîchissez la conversation.'],
  [/REVIEW_WINDOW_CLOSED/, 'Le délai pour laisser un avis (14 jours) est dépassé.'],
  [/duplicate key|unique constraint/i, 'C’est déjà fait !'],
  [/AI_RATE_LIMITED/, 'Trop d’analyses IA cette heure-ci. Remplissez l’annonce à la main ou réessayez plus tard.'],
  [/Network request failed|Failed to fetch|FunctionsFetchError|fetch failed/i, 'Pas de connexion. Vérifiez votre réseau et réessayez.'],
];

export function friendlyError(e: unknown, fallback = 'Une erreur est survenue. Réessayez.'): string {
  const raw = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e ? String((e as { message: unknown }).message) : String(e ?? '');
  for (const [re, msg] of MESSAGES) if (re.test(raw)) return msg;
  return raw && raw.length < 160 && !/^[A-Z_]+(:|$)/.test(raw) ? raw : fallback;
}
