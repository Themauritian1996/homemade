import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HealthEditor } from '@/components/HealthEditor';
import { Button, IconButton } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { saveHealthProfile } from '@/services/profile';
import { useApp } from '@/store/app';
import { colors, spacing, type } from '@/theme';

import { t } from '@/i18n';
export default function HealthModal() {
  const insets = useSafeAreaInsets();
  const { health, setHealth } = useApp();
  const [draft, setDraft] = useState(health);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await saveHealthProfile(draft);
      setHealth(draft);
      router.back();
    } catch (e) {
      Alert.alert(t('Préférences non enregistrées'), friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: insets.top + spacing.md }}>
        <Text style={type.h2}>{t('Préférences alimentaires')}</Text>
        <IconButton icon="close" onPress={() => router.back()} accessibilityLabel={t('Fermer')} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: spacing.xl, paddingBottom: 140 }}>
        <HealthEditor value={draft} onChange={setDraft} />
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: insets.bottom + spacing.lg, backgroundColor: colors.bg }}>
        <Button title={t('Enregistrer')} onPress={save} loading={saving} />
      </View>
    </View>
  );
}
