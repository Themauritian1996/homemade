import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HealthEditor } from '@/components/HealthEditor';
import { Button } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { saveHealthProfile } from '@/services/profile';
import { useApp } from '@/store/app';
import { colors, radius, spacing, type } from '@/theme';

export default function Onboarding() {
  const insets = useSafeAreaInsets();
  const { health, setHealth, setOnboarded, setLocation, user } = useApp();
  const [draft, setDraft] = useState(health);
  const [saving, setSaving] = useState(false);

  const finish = async () => {
    setSaving(true);
    try {
      // Fail-closed : le filtrage se fait sur le serveur. Sans profil enregistré, on ne continue pas.
      await saveHealthProfile(draft);
    } catch (e) {
      setSaving(false);
      Alert.alert('Profil santé non enregistré', `${friendlyError(e)}\n\nVos allergies doivent être enregistrées pour que les repas soient filtrés.`);
      return;
    }
    setHealth(draft);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        setLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }, true);
      }
    } catch {
      // Position facultative : le fil reste centré sur la position par défaut, modifiable depuis la carte.
    } finally {
      setSaving(false);
      setOnboarded(true);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + spacing.xxl, paddingHorizontal: spacing.xxl, paddingBottom: 140 }}>
        <Text style={type.label}>Votre profil santé</Text>
        <Text style={[type.h1, { marginTop: spacing.sm }]}>Bienvenue {user?.displayName ?? ''} !</Text>
        <Text style={[type.body, { marginTop: spacing.sm, marginBottom: spacing.xxl }]}>
          Dites-nous ce que vous ne pouvez pas manger. Nous filtrerons automatiquement chaque repas pour vous.
        </Text>
        <HealthEditor value={draft} onChange={setDraft} />
        <View
          style={{
            flexDirection: 'row',
            gap: spacing.sm,
            marginTop: spacing.xxl,
            backgroundColor: colors.surface,
            padding: spacing.lg,
            borderRadius: radius.lg,
          }}
        >
          <Ionicons name="location-outline" size={18} color={colors.forest} />
          <Text style={[type.caption, { flex: 1 }]}>
            À l'étape suivante, nous demanderons votre position pour afficher les plats près de chez vous. Elle n'est jamais montrée aux autres membres.
          </Text>
        </View>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xxl, paddingBottom: insets.bottom + spacing.lg, backgroundColor: colors.bg, gap: spacing.sm }}>
        <Button title={draft.allergens.length || draft.diets.length ? 'Enregistrer et continuer' : 'Je n’ai aucune restriction'} onPress={finish} loading={saving} />
      </View>
    </View>
  );
}
