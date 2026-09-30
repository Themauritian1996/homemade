import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { ALLERGENS, AllergenCode, allergenById } from '@/data/allergens';
import { colors, fonts, radius, spacing } from '@/theme';
import { Chip } from './ui';

import { t, tr } from '@/i18n';
/** Grille de sélection d'allergènes (profil santé Eater, validation Cooker). */
export function AllergenPicker({
  selected,
  onToggle,
  highlight = [],
}: {
  selected: AllergenCode[];
  onToggle: (code: AllergenCode) => void;
  /** Allergènes suggérés par l'IA (affichés avec un indicateur). */
  highlight?: AllergenCode[];
}) {
  return (
    <View style={styles.wrap}>
      {ALLERGENS.map((a) => (
        <View key={a.id}>
          <Chip emoji={a.emoji} label={tr(a)} tone="danger" selected={selected.includes(a.id)} onPress={() => onToggle(a.id)} />
          {highlight.includes(a.id) && <View style={styles.aiDot} />}
        </View>
      ))}
    </View>
  );
}

/** Liste lecture seule des allergènes d'un plat. */
export function AllergenList({ codes, mayContain = [], conflicts = [] }: { codes: AllergenCode[]; mayContain?: AllergenCode[]; conflicts?: AllergenCode[] }) {
  if (codes.length === 0 && mayContain.length === 0) {
    return <Text style={styles.none}>{t('Aucun allergène prioritaire déclaré')}</Text>;
  }
  return (
    <View style={styles.wrap}>
      {codes.map((c) => {
        const a = allergenById(c);
        const bad = conflicts.includes(c);
        return (
          <View key={c} style={[styles.pill, bad && styles.pillBad]}>
            <Text style={styles.pillText}>
              {a.emoji} {tr(a)}
            </Text>
          </View>
        );
      })}
      {mayContain.map((c) => (
        <View key={`t-${c}`} style={[styles.pill, styles.pillTrace]}>
          <Text style={[styles.pillText, { color: colors.warning }]}>{t('Traces :')}{' '}{tr(allergenById(c))}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  aiDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.saffron,
    borderWidth: 2,
    borderColor: colors.bg,
  },
  pill: { backgroundColor: colors.surfaceAlt, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill },
  pillBad: { backgroundColor: colors.dangerSoft },
  pillTrace: { backgroundColor: colors.saffronSoft },
  pillText: { fontFamily: fonts.medium, fontSize: 13, color: colors.inkSoft },
  none: { fontFamily: fonts.medium, fontSize: 14, color: colors.success },
});
