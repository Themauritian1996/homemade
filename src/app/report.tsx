/** Signaler un plat ou un membre. Incident allergène / hygiène ⇒ le plat est suspendu immédiatement (serveur). */
import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ScreenHeader } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { ReportReason, sendReport } from '@/services/account';
import { useApp } from '@/store/app';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
const REASONS: { id: ReportReason; label: string; hint: string }[] = [
  { id: 'allergen_incident', label: 'Réaction allergique / allergène non déclaré', hint: 'Le plat est retiré immédiatement.' },
  { id: 'hygiene', label: 'Problème d’hygiène ou plat avarié', hint: 'Le plat est retiré immédiatement.' },
  { id: 'misleading', label: 'Plat différent de l’annonce', hint: '' },
  { id: 'no_show', label: 'Absent au rendez-vous', hint: '' },
  { id: 'harassment', label: 'Comportement inapproprié', hint: '' },
  { id: 'fraud', label: 'Fraude ou arnaque', hint: '' },
  { id: 'off_platform', label: 'Paiement demandé hors de l’app', hint: 'Interac, comptant… : interdit, le compte peut être suspendu.' },
  { id: 'other', label: 'Autre', hint: '' },
];

export default function Report() {
  const { mealId, subjectId, orderId, title } = useLocalSearchParams<{ mealId?: string; subjectId?: string; orderId?: string; title?: string }>();
  const insets = useSafeAreaInsets();
  const user = useApp((s) => s.user);
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);

  const submit = async () => {
    if (!user || !reason) return;
    setSending(true);
    try {
      await sendReport(user.id, { reason, details, mealId, subjectId, orderId });
      Alert.alert(
        t('Merci'),
        reason === 'allergen_incident' || reason === 'hygiene'
          ? t('Le plat a été retiré de l’app pendant la vérification.')
          : t('Votre signalement a été transmis à l’équipe.'),
      );
      router.back();
    } catch (e) {
      Alert.alert(t('Envoi impossible'), friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('Signaler')} subtitle={title} modal />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.md, paddingBottom: insets.bottom + spacing.huge }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.urgent}>
          <Ionicons name="warning" size={18} color={colors.danger} />
          <Text style={[type.caption, { flex: 1, color: colors.danger }]}>{t('Réaction allergique grave : appelez le 911 avant tout.')}</Text>
        </View>
        {REASONS.map((r) => (
          <Pressable
            key={r.id}
            onPress={() => setReason(r.id)}
            style={[styles.option, reason === r.id && styles.optionActive]}
            accessibilityRole="radio"
            accessibilityState={{ selected: reason === r.id }}
          >
            <Ionicons name={reason === r.id ? 'radio-button-on' : 'radio-button-off'} size={20} color={reason === r.id ? colors.forest : colors.muted} />
            <View style={{ flex: 1 }}>
              <Text style={type.bodyStrong}>{t(r.label)}</Text>
              {!!r.hint && <Text style={type.caption}>{t(r.hint)}</Text>}
            </View>
          </Pressable>
        ))}
        <TextInput
          value={details}
          onChangeText={setDetails}
          placeholder={t('Décrivez ce qui s’est passé (facultatif)')}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          style={styles.input}
        />
        <Button title={t('Envoyer le signalement')} variant="danger" icon="flag-outline" onPress={submit} loading={sending} disabled={!reason} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  urgent: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center', backgroundColor: colors.dangerSoft, padding: spacing.md, borderRadius: radius.md },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: 'transparent',
    minHeight: 52,
  },
  optionActive: { borderColor: colors.forest, backgroundColor: colors.sage },
  input: {
    minHeight: 100,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    borderWidth: 1,
    borderColor: colors.border,
    textAlignVertical: 'top',
  },
});
