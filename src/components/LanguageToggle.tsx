/** Choix de la langue (FR / EN) : accueil, connexion, paramètres. */
import * as Haptics from 'expo-haptics';
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { LANGUAGES, t, useLang } from '@/i18n';
import { useApp } from '@/store/app';
import { colors, fonts, radius } from '@/theme';

export function LanguageToggle({ dark }: { dark?: boolean }) {
  const lang = useLang();
  const setLang = useApp((s) => s.setLang);
  return (
    <View style={[styles.wrap, dark && styles.wrapDark]} accessibilityRole="radiogroup" accessibilityLabel={t('Langue / Language')}>
      {LANGUAGES.map((l) => {
        const active = l.id === lang;
        return (
          <Pressable
            key={l.id}
            onPress={() => {
              if (active) return;
              Haptics.selectionAsync().catch(() => {});
              setLang(l.id);
            }}
            style={[styles.item, active && (dark ? styles.itemActiveDark : styles.itemActive)]}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={l.label}
            hitSlop={4}
          >
            <Text style={[styles.text, dark && { color: 'rgba(255,255,255,0.8)' }, active && { color: dark ? colors.forest : colors.onDark }]}>
              {l.id.toUpperCase()}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  wrapDark: { backgroundColor: 'rgba(255,255,255,0.14)', borderColor: 'rgba(255,255,255,0.25)' },
  item: { minWidth: 44, height: 32, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 10 },
  itemActive: { backgroundColor: colors.forest },
  itemActiveDark: { backgroundColor: colors.surface },
  text: { fontFamily: fonts.semibold, fontSize: 13, color: colors.inkSoft, letterSpacing: 0.5 },
});
