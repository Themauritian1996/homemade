/**
 * Conditions d'utilisation et politique de confidentialité — VERSION BÊTA.
 * ⚠️ Textes de travail à faire valider par un juriste avant toute ouverture publique (voir docs/05, « Conformité »).
 */
import { useLocalSearchParams } from 'expo-router';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScreenHeader } from '@/components/ui';
import { colors, spacing, type } from '@/theme';

import { t } from '@/i18n';
const UPDATED = '29 septembre 2026';

const DOCS: Record<string, { title: string; sections: [string, string][] }> = {
  terms: {
    title: "Conditions d'utilisation",
    sections: [
      [
        'Bêta fermée',
        "Homemade est une version de test offerte sur invitation, gratuitement. Des fonctions peuvent changer ou être interrompues. Vos commentaires nous aident à l'améliorer.",
      ],
      [
        'Le service',
        "Homemade met en relation des particuliers qui partagent des repas faits maison. Homemade n'est ni cuisinier ni vendeur : chaque Cooker est responsable des plats qu'il prépare et de la déclaration de leurs ingrédients et allergènes.",
      ],
      [
        'Engagements des Cookers',
        "Déclarer tous les ingrédients et allergènes de façon complète et exacte ; respecter les règles d'hygiène et de conservation décrites dans l'aide ; ne partager que des plats préparés pour la consommation humaine, dans de bonnes conditions ; respecter les lois applicables, notamment en matière de salubrité (MAPAQ).",
      ],
      [
        'Engagements des Eaters',
        "Tenir compte des informations d'allergènes, confirmer avec le Cooker en cas d'allergie sévère, respecter les rendez-vous de cueillette et conserver le plat au froid.",
      ],
      [
        'Échanges et paiements',
        "Les plats s'échangent ou se vendent dans l'app. Un achat est pré-autorisé à la commande et débité seulement à la cueillette, par Stripe. Proposer ou accepter un paiement hors de l'app (Interac, comptant…) est interdit : ces demandes sont masquées et peuvent entraîner la suspension du compte.",
      ],
      [
        'Respect et sécurité',
        "Harcèlement, discrimination, fraude ou plat trompeur entraînent la suspension du compte. Un signalement d'incident allergène ou d'hygiène retire immédiatement le plat en attendant vérification.",
      ],
      [
        'Responsabilité',
        "Une cuisine domestique n'est jamais exempte d'allergènes. Dans les limites permises par la loi, Homemade ne peut garantir l'exactitude des déclarations faites par les membres.",
      ],
      ['Nous joindre', 'Utilisez « Donner mon avis sur la bêta » dans votre profil. Nous répondons à toute demande dans un délai raisonnable.'],
    ],
  },
  privacy: {
    title: 'Politique de confidentialité',
    sections: [
      [
        'Responsable',
        'La personne qui organise la bêta de Homemade est responsable de la protection des renseignements personnels (Loi 25). Pour la joindre : « Donner mon avis sur la bêta » dans votre profil.',
      ],
      [
        'Ce que nous recueillons',
        'Compte : prénom, courriel, mot de passe (chiffré). Profil public : prénom, quartier, photo et bio facultatifs, notes reçues. Profil santé : allergies, intolérances et régimes — renseignements sensibles, recueillis avec votre consentement explicite. Activité : plats publiés, photos, échanges, messages, avis, signalements, commentaires. Position : utilisée sur votre téléphone pour trouver les plats proches.',
      ],
      [
        'Pourquoi',
        "Faire fonctionner le service (fil filtré, carte, échanges, chat) et le rendre plus sûr. Votre profil santé sert uniquement à retirer les plats incompatibles ; il n'est jamais montré aux autres membres.",
      ],
      [
        'Localisation',
        "Votre position de recherche n'est pas publiée. L'adresse du Cooker reste privée : publiquement, seuls la zone postale (ex. H2J) et un point décalé de 100 à 300 m sont affichés ; l'adresse exacte n'est révélée qu'à la personne dont la commande ou l'échange est accepté (et payé, pour un achat).",
      ],
      [
        'Intelligence artificielle',
        "Si vous utilisez l'analyse de photo ou la lecture d'étiquette, la photo (et elle seule, jamais votre profil santé) est transmise à un fournisseur d'IA situé aux États-Unis — Google (Gemini) ou, en secours, Groq — pour produire une suggestion. Pendant la bêta, nous utilisons leurs offres gratuites, dont les données peuvent servir à améliorer leurs services : ne photographiez ni visage, ni document personnel. Vous pouvez toujours remplir l'annonce à la main.",
      ],
      [
        'Hébergement',
        "Les données sont hébergées par Supabase. Pendant la bêta, l'hébergement peut se situer hors du Québec ; un transfert vers un hébergement au Canada est prévu avant le lancement public.",
      ],
      [
        'Conservation',
        'Vos données sont conservées tant que votre compte est actif. À la suppression, votre profil santé, vos photos et vos annonces sont effacés ; vos avis et messages restent visibles de l’autre partie sous « Membre supprimé ».',
      ],
      [
        'Vos droits',
        'Accès et copie de vos données (Paramètres → Obtenir une copie), rectification (Paramètres → Profil), retrait du consentement et suppression (Paramètres → Supprimer mon compte).',
      ],
    ],
  },
};

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const insets = useSafeAreaInsets();
  const d = DOCS[doc] ?? DOCS.terms;
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t(d.title)} subtitle={t('Version bêta · {0}', { 0: UPDATED })} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: insets.bottom + spacing.huge }}>
        {d.sections.map(([title, body]) => (
          <View key={title} style={{ gap: spacing.xs }}>
            <Text style={type.h3}>{t(title)}</Text>
            <Text style={type.body}>{t(body)}</Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}
