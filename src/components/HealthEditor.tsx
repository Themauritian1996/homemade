import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Pressable, Switch, Text, View } from 'react-native';
import { AllergenCode, DIETS, allergenById } from '@/data/allergens';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import type { AllergenSeverity, HealthProfile } from '@/types';
import { AllergenPicker } from './AllergenPicker';
import { Chip } from './ui';

import { t, tr } from '@/i18n';
/** Éditeur des préférences alimentaires (profil santé) de l'Eater — utilisé à l'onboarding et dans le profil. */
export function HealthEditor({ value, onChange }: { value: HealthProfile; onChange: (h: HealthProfile) => void }) {
  const codes = value.allergens.map((a) => a.code);

  const toggleAllergen = (code: AllergenCode) =>
    onChange({
      ...value,
      allergens: codes.includes(code) ? value.allergens.filter((a) => a.code !== code) : [...value.allergens, { code, severity: 'allergy' }],
    });

  const setSeverity = (code: AllergenCode, severity: AllergenSeverity) =>
    onChange({ ...value, allergens: value.allergens.map((a) => (a.code === code ? { ...a, severity } : a)) });

  return (
    <View style={{ gap: spacing.xxl }}>
      <View style={{ gap: spacing.md }}>
        <Text style={type.label}>{t('Régimes et préférences')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {DIETS.map((d) => (
            <Chip
              key={d.id}
              label={tr(d)}
              selected={value.diets.includes(d.id)}
              onPress={() => onChange({ ...value, diets: value.diets.includes(d.id) ? value.diets.filter((x) => x !== d.id) : [...value.diets, d.id] })}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: spacing.md }}>
        <Text style={type.label}>{t('Allergies & intolérances (facultatif)')}</Text>
        <AllergenPicker selected={codes} onToggle={toggleAllergen} />
      </View>

      {value.allergens.length > 0 && (
        <View style={styles.card}>
          <Text style={type.bodyStrong}>{t('Niveau de sévérité')}</Text>
          {value.allergens.map((a) => {
            const meta = allergenById(a.code);
            return (
              <View key={a.code} style={styles.sevRow}>
                <Text style={[type.body, { flex: 1 }]}>
                  {meta.emoji} {tr(meta)}
                </Text>
                <View style={styles.segment}>
                  {(['allergy', 'intolerance'] as const).map((s) => (
                    <Pressable key={s} onPress={() => setSeverity(a.code, s)} style={[styles.segItem, a.severity === s && styles.segActive]}>
                      <Text style={[styles.segText, a.severity === s && { color: colors.onDark }]}>{s === 'allergy' ? t('Allergie') : t('Intolérance')}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            );
          })}
          <View style={styles.sevRow}>
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{t('Exclure aussi les « traces possibles »')}</Text>
              <Text style={type.caption}>{t('Toujours actif pour les allergies. S\'applique ici aussi aux intolérances.')}</Text>
            </View>
            <Switch value={value.strictTraces} onValueChange={(strictTraces) => onChange({ ...value, strictTraces })} trackColor={{ true: colors.forest }} />
          </View>
        </View>
      )}

      <View style={styles.notice}>
        <Ionicons name="shield-checkmark" size={18} color={colors.forest} />
        <Text style={[type.caption, { flex: 1, color: colors.forest }]}>{t('Votre fil et la carte s\'adaptent automatiquement. Une cuisine maison n\'est jamais sans allergènes : en cas d\'allergie sévère, confirmez avec le Cooker dans le chat.')}</Text>
      </View>
    </View>
  );
}

const styles = createStyles(() => ({
  card: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  sevRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.sm, padding: 3 },
  segItem: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  segActive: { backgroundColor: colors.danger },
  segText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.inkSoft },
  notice: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.sage, padding: spacing.lg, borderRadius: radius.lg },
}));
