/**
 * Homemade design system — "Warm Editorial".
 * Crème chaud + vert forêt profond + accent tomate : on évoque la cuisine maison,
 * mais avec la rigueur visuelle d'une app premium (Good Food, Airbnb, Uber Eats).
 * Toute couleur/espacement/typo de l'app doit venir d'ici.
 */
import { Platform, StyleSheet, TextStyle, ViewStyle } from 'react-native';

const light = {
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
  /** Fond toujours sombre (écran d'analyse photo), quel que soit le thème. */
  night: '#1B1A17',
};

/** Mode sombre : même identité (crème → brun nuit, vert forêt éclairci), contrastes AA sur les surfaces sombres. */
const dark: Palette = {
  bg: '#141412',
  surface: '#1E1D1A',
  surfaceAlt: '#2A2824',
  border: '#3A3731',

  forest: '#4E8C6C',
  forestSoft: '#3D7258',
  sage: '#17241D',
  tomato: '#E2553B',
  tomatoSoft: '#3A231D',
  saffron: '#F2B441',
  saffronSoft: '#3A3020',

  ink: '#F3EFE7',
  inkSoft: '#CFC9BD',
  muted: '#9A958B',
  onDark: '#FFFFFF',

  success: '#4FA172',
  warning: '#E0A040',
  danger: '#E5634B',
  dangerSoft: '#3A1E19',
  info: '#5B9BD8',

  overlay: 'rgba(0,0,0,0.6)',
  night: '#1B1A17',
};

export type Palette = Record<keyof typeof light, string>;
export type Scheme = 'light' | 'dark';

/** Palette active : ses valeurs changent avec le thème (l'arbre d'écrans est alors reconstruit). */
export const colors: Palette = { ...light };
let currentScheme: Scheme = 'light';
let version = 0;
export const getScheme = () => currentScheme;


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

const buildType = () => ({
  hero: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40, color: colors.ink, letterSpacing: -0.5 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34, color: colors.ink, letterSpacing: -0.3 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28, color: colors.ink },
  h3: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 22, color: colors.inkSoft },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 22, color: colors.ink },
  caption: { fontFamily: fonts.medium, fontSize: 13, lineHeight: 18, color: colors.muted },
  label: { fontFamily: fonts.semibold, fontSize: 12, lineHeight: 16, color: colors.muted, letterSpacing: 0.6, textTransform: 'uppercase' },
  price: { fontFamily: fonts.bold, fontSize: 17, color: colors.ink },
}) satisfies Record<string, TextStyle>;

export const type = buildType();

/** Applique un thème : la palette et la typographie sont mises à jour, les feuilles de style se recalculent. */
export function applyScheme(scheme: Scheme) {
  if (scheme === currentScheme) return;
  currentScheme = scheme;
  Object.assign(colors, scheme === 'dark' ? dark : light);
  Object.assign(type, buildType());
  version++;
}

/**
 * Feuille de style qui suit le thème : se déclare comme StyleSheet.create, mais est recalculée (puis mise en cache)
 * quand le thème change. L'arbre d'écrans étant reconstruit à ce moment, chaque écran relit les bonnes couleurs.
 */
export function createStyles<T extends StyleSheet.NamedStyles<T>>(factory: () => T): T {
  let cache: T | null = null;
  let cachedFor = -1;
  return new Proxy({} as T, {
    get(_, key) {
      if (!cache || cachedFor !== version) {
        cache = StyleSheet.create(factory());
        cachedFor = version;
      }
      return cache[key as keyof T];
    },
  });
}

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
