import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { router } from 'expo-router';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LanguageToggle } from '@/components/LanguageToggle';
import { Avatar, Button, Card, Chip, Divider, ListRow, ScreenHeader, TextField } from '@/components/ui';
import { DEMO_MODE } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { aiProviderLabel } from '@/services/ai';
import { appVersion, deleteMyAccount, EditableProfile, exportMyData, loadAccount, saveProfile, saveSettings, Settings, uploadAvatar } from '@/services/account';
import { useApp } from '@/store/app';
import { colors, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
const RADII = [2, 5, 10, 15, 25];

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const user = useApp((s) => s.user);
  const setUser = useApp((s) => s.setUser);
  const setFilters = useApp((s) => s.setFilters);
  const [profile, setProfile] = useState<EditableProfile | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState<'export' | 'delete' | null>(null);

  useEffect(() => {
    if (!user) return;
    loadAccount(user.id)
      .then(({ profile: p, settings: s }) => {
        setProfile({ ...p, displayName: p.displayName || user.displayName });
        setSettings(s);
      })
      .catch((e) => Alert.alert(t('Chargement impossible'), friendlyError(e)));
  }, [user]);

  if (!user || !profile || !settings) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg }}>
        <ScreenHeader title={t('Paramètres')} />
        <ActivityIndicator color={colors.forest} style={{ marginTop: spacing.huge }} />
      </View>
    );
  }

  const updateSettings = (patch: Partial<Settings>) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    if (patch.defaultRadiusKm) setFilters({ radiusKm: patch.defaultRadiusKm });
    saveSettings(user.id, next).catch((e) => Alert.alert(t('Préférence non enregistrée'), friendlyError(e)));
  };

  const submitProfile = async () => {
    if (profile.displayName.trim().length < 2) return Alert.alert(t('Prénom'), t('Indiquez au moins 2 caractères.'));
    setSavingProfile(true);
    try {
      await saveProfile(user.id, profile);
      setUser({ ...user, displayName: profile.displayName.trim() });
      Alert.alert(t('Profil enregistré'), t('Vos voisins voient maintenant ces informations.'));
    } catch (e) {
      Alert.alert(t('Enregistrement impossible'), friendlyError(e));
    } finally {
      setSavingProfile(false);
    }
  };

  const changeAvatar = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) return Alert.alert(t('Permission requise'), t('Autorisez l’accès aux photos dans les réglages du téléphone.'));
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.6 });
    if (res.canceled || !res.assets[0]) return;
    setUploading(true);
    try {
      const url = await uploadAvatar(user.id, res.assets[0].uri, profile.avatarUrl);
      setProfile({ ...profile, avatarUrl: url });
    } catch (e) {
      Alert.alert(t('Photo non enregistrée'), friendlyError(e));
    } finally {
      setUploading(false);
    }
  };

  const exportData = async () => {
    setBusy('export');
    try {
      const json = await exportMyData();
      await Share.share({ title: t('Mes données Homemade'), message: json });
    } catch (e) {
      Alert.alert(t('Export impossible'), friendlyError(e));
    } finally {
      setBusy(null);
    }
  };

  const deleteAccount = () =>
    Alert.alert(
      t('Supprimer mon compte ?'),
      t('Vos annonces sont retirées, votre profil santé et vos photos sont effacés, votre profil public devient « Membre supprimé ». Cette action est définitive.'),
      [
        { text: t('Annuler'), style: 'cancel' },
        {
          text: t('Supprimer définitivement'),
          style: 'destructive',
          onPress: async () => {
            setBusy('delete');
            try {
              await deleteMyAccount(user.id);
            } catch (e) {
              setBusy(null);
              Alert.alert(t('Suppression impossible'), friendlyError(e));
            }
          },
        },
      ],
    );

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title={t('Paramètres')} />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.xl, paddingBottom: insets.bottom + spacing.huge }}
        keyboardShouldPersistTaps="handled"
      >
        <Section title={t('Profil public')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.lg }}>
            <Pressable onPress={changeAvatar} accessibilityRole="button" accessibilityLabel={t('Changer la photo de profil')}>
              <Avatar name={profile.displayName || '?'} uri={profile.avatarUrl} size={72} />
              <View style={styles.avatarBadge}>
                {uploading ? <ActivityIndicator size="small" color={colors.onDark} /> : <Ionicons name="camera" size={14} color={colors.onDark} />}
              </View>
            </Pressable>
            <Text style={[type.caption, { flex: 1 }]}>{t('Une photo de vous (ou de votre cuisine) inspire confiance à vos voisins.')}</Text>
          </View>
          <TextField
            label={t('Prénom')}
            value={profile.displayName}
            onChangeText={(displayName) => setProfile({ ...profile, displayName })}
            maxLength={40}
            icon="person-outline"
          />
          <TextField
            label={t('Quartier')}
            value={profile.neighborhood}
            onChangeText={(neighborhood) => setProfile({ ...profile, neighborhood })}
            placeholder={t('Ex. Rosemont')}
            maxLength={80}
            icon="home-outline"
          />
          <TextField
            label={t('À propos de moi')}
            value={profile.bio}
            onChangeText={(bio) => setProfile({ ...profile, bio })}
            placeholder={t('Ce que vous aimez cuisiner, vos spécialités…')}
            multiline
            maxLength={400}
            style={{ minHeight: 80, textAlignVertical: 'top' }}
          />
          <Button title={t('Enregistrer le profil')} onPress={submitProfile} loading={savingProfile} size="md" />
        </Section>

        <Section title={t('Langue · Language')}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
            <Text style={[type.body, { flex: 1 }]}>{t('Langue de l\'application')}</Text>
            <LanguageToggle />
          </View>
        </Section>

        <Section title={t('Recherche')}>
          <Text style={type.caption}>{t('Rayon utilisé par défaut dans le fil et sur la carte.')}</Text>
          <View style={styles.wrap}>
            {RADII.map((r) => (
              <Chip key={r} label={t('{0} km', { 0: r })} selected={settings.defaultRadiusKm === r} onPress={() => updateSettings({ defaultRadiusKm: r })} />
            ))}
          </View>
        </Section>

        <Section title={t('Notifications')}>
          <Card>
            <SwitchRow label={t('Nouveaux messages et commandes')} value={settings.notifyMessages} onChange={(v) => updateSettings({ notifyMessages: v })} />
            <Divider />
            <SwitchRow label={t('Nouveaux plats près de chez moi')} value={settings.notifyNewNearby} onChange={(v) => updateSettings({ notifyNewNearby: v })} />
          </Card>
          <Text style={type.caption}>{t('Pendant la bêta, les nouveautés s\'affichent par des pastilles dans l\'app (onglet Messages). Les notifications sur le téléphone arrivent bientôt : vos choix seront respectés.')}</Text>
        </Section>

        <Section title={t('Confidentialité et données (Loi 25)')}>
          <Card>
            <ListRow
              icon="download-outline"
              title={t('Obtenir une copie de mes données')}
              subtitle={t('Profil, profil santé, plats, commandes, messages')}
              onPress={busy ? undefined : exportData}
              right={busy === 'export' ? <ActivityIndicator color={colors.forest} /> : undefined}
            />
            <Divider />
            <ListRow
              icon="document-text-outline"
              title={t('Politique de confidentialité')}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}
            />
            <Divider />
            <ListRow
              icon="reader-outline"
              title={t('Conditions d\'utilisation')}
              onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}
            />
            <Divider />
            <ListRow
              icon="trash-outline"
              tone="danger"
              title={t('Supprimer mon compte')}
              subtitle={t('Définitif')}
              onPress={busy ? undefined : deleteAccount}
              right={busy === 'delete' ? <ActivityIndicator color={colors.danger} /> : undefined}
            />
          </Card>
        </Section>

        <Section title={t('À propos')}>
          <Card>
            <InfoRow label={t('Version')} value={`${appVersion()}${DEMO_MODE ? ` · ${t('démo')}` : ''}`} />
            <Divider />
            <InfoRow label={t('Analyse IA')} value={aiProviderLabel()} />
            <Divider />
            <InfoRow label={t('Compte')} value={user.email || '—'} />
          </Card>
        </Section>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <Text style={type.label}>{title}</Text>
      {children}
    </View>
  );
}

function SwitchRow({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={[type.bodyStrong, { flex: 1 }]}>{label}</Text>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: colors.forest }} accessibilityLabel={label} />
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.switchRow}>
      <Text style={[type.body, { flex: 1 }]}>{label}</Text>
      <Text style={[type.bodyStrong, { flexShrink: 1, textAlign: 'right' }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 },
  avatarBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 28,
    height: 28,
    borderRadius: radius.pill,
    backgroundColor: colors.tomato,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
});
