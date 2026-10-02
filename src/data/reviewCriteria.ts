/** Critères d'avis, selon le rôle de la personne notée (clés = `reviews.sub_scores`). Libellés traduits via t(). */
export const REVIEW_CRITERIA = {
  // L'Eater note le Cooker : le plat et la remise.
  cooker: [
    { id: 'taste', label: 'Goût' },
    { id: 'hygiene', label: 'Hygiène & emballage' },
    { id: 'accuracy', label: 'Conforme à l’annonce' },
    { id: 'punctuality', label: 'Ponctualité' },
  ],
  // Le Cooker note l'Eater : sa fiabilité.
  eater: [
    { id: 'punctuality', label: 'Venu à l’heure' },
    { id: 'communication', label: 'Communication' },
    { id: 'respect', label: 'Respect et politesse' },
    { id: 'reliability', label: 'Fiabilité (a tenu parole)' },
  ],
} as const;

export const REVIEW_TAGS = {
  cooker: ['Généreux', 'Savoureux', 'Bien emballé', 'Sympathique', 'Ponctuel', 'Sain', 'Comme à la maison'],
  eater: ['À l’heure', 'Bonne communication', 'Respectueux', 'Fiable', 'Contenants rendus', 'Sympathique'],
} as const;

export const criterionLabel = (role: 'cooker' | 'eater', id: string) =>
  (REVIEW_CRITERIA[role] as readonly { id: string; label: string }[]).find((c) => c.id === id)?.label ?? id;
