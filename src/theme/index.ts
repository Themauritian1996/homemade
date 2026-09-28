/**
 * Homemade design system — "Warm Editorial".
 * Crème chaud + vert forêt profond + accent tomate : on évoque la cuisine maison,
 * mais avec la rigueur visuelle d'une app premium (Good Food, Airbnb, Uber Eats).
 * Toute couleur/espacement/typo de l'app doit venir d'ici.
 */
import { Platform, TextStyle, ViewStyle } from 'react-native';

export const colors = {
  // Surfaces
  bg: '#FAF6EF', // crème — fond global
  surface: '#FFFFFF',
  surfaceAlt: '#F3EDE3', // cartes secondaires, chips inactives
  border: '#E8E0D3',

  // Marque
  forest: '#1F3A2E', // primaire : confiance, santé
  forestSoft: '#2F5443',
  sage: '#DCE7DF', // fond doux associé au vert
  tomato: '#E2553B', // accent : appétit, CTA secondaires, prix
  tomatoSoft: '#FBE3DC',
  saffron: '#F2B441', // étoiles, badges "top cooker"
  saffronSoft: '#FCF0D4',

  // Texte
  ink: '#1B1A17',
  inkSoft: '#4A4740',
  muted: '#8A857B',
  onDark: '#FFFFFF',

  // Sémantique
  success: '#2E7D4F',
  warning: '#C77A12',
  danger: '#C23B22',
  dangerSoft: '#F9DEDA',
  info: '#2F6FB0',

  overlay: 'rgba(27,26,23,0.45)',
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32, huge: 48 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 } as const;

export const fonts = {
  display: 'Fraunces_600SemiBold',
  displayItalic: 'Fraunces_500Medium_Italic',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
} as const;

export const type = {
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  price: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
} satisfies Record<string, TextStyle>;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: '#3B2F1E', shadowOpacity: 0.08, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: 3, shadowColor: '#3B2F1E' },
  }),
  floating: Platform.select<ViewStyle>({
    ios: { shadowColor: '#3B2F1E', shadowOpacity: 0.16, shadowRadius: 24, shadowOffset: { width: 0, height: 10 } },
    default: { elevation: 8, shadowColor: '#3B2F1E' },
  }),
};

export const theme = { colors, spacing, radius, fonts, type, shadow };
export type Theme = typeof theme;
