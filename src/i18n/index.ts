/**
 * Langue de l'interface : français (par défaut, Charte de la langue française) ou anglais.
 * La clé d'une traduction est le texte français lui-même : une traduction manquante retombe sur le français.
 * Variables : t('Bonjour {name}', { name }) ; le même gabarit sert de clé dans `en.ts`.
 */
import { useApp } from '@/store/app';
import { EN } from './en';

export type Lang = 'fr' | 'en';

export const LANGUAGES: { id: Lang; label: string; flag: string }[] = [
  { id: 'fr', label: 'Français', flag: '⚜️' },
  { id: 'en', label: 'English', flag: '🍁' },
];

export const getLang = (): Lang => useApp.getState().lang ?? 'fr';

/** Locale des nombres, prix et dates. */
export const locale = () => (getLang() === 'en' ? 'en-CA' : 'fr-CA');

export function t(fr: string, params?: Record<string, string | number>): string {
  const s = getLang() === 'en' ? (EN[fr] ?? fr) : fr;
  return params ? s.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : s;
}

/** Libellé d'un référentiel bilingue (allergènes, régimes, cuisines : { fr, en }). */
export const tr = (x: { fr: string; en: string }) => (getLang() === 'en' ? x.en : x.fr);

/** Abonne un composant à la langue (l'arbre entier est aussi remonté au changement, voir _layout). */
export const useLang = () => useApp((s) => s.lang ?? 'fr');
