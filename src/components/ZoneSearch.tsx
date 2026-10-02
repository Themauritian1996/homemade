/** Chercher des plats autour d'une zone : code postal (« H2J » ou « H2J 1A1 »), quartier ou adresse. */
import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { geocode } from '@/services/address';
import { useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, shadow, spacing, type } from '@/theme';
import type { GeoPoint } from '@/types';
import { Button } from './ui';

export function ZoneSearch({ visible, onClose, onFound }: { visible: boolean; onClose: () => void; onFound?: (p: GeoPoint, label: string) => void }) {
  const insets = useSafeAreaInsets();
  const setLocation = useApp((s) => s.setLocation);
  const [query, setQuery] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const search = async () => {
    if (!query.trim()) return;
    setBusy(true);
    setError(undefined);
    try {
      const hit = await geocode(query);
      if (!hit) return setError(t('Zone introuvable. Essayez un code postal (ex. H2J) ou un quartier.'));
      const p = { latitude: hit.latitude, longitude: hit.longitude };
      setLocation(p, false);
      onFound?.(p, query.trim().toUpperCase().length <= 7 ? query.trim().toUpperCase() : query.trim());
      onClose();
    } catch {
      setError(t('Recherche impossible pour le moment.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('Fermer')} />
      <View style={[styles.sheet, { top: insets.top + spacing.xl }]}>
        <Text style={type.h3}>{t('Chercher autour de…')}</Text>
        <View style={styles.field}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Code postal, quartier ou adresse')}
            placeholderTextColor={colors.muted}
            style={styles.input}
            autoFocus
            autoCapitalize="characters"
            returnKeyType="search"
            onSubmitEditing={search}
          />
          {busy && <ActivityIndicator color={colors.forest} />}
        </View>
        {error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
        <Text style={type.caption}>{t('Les Cookers apparaissent par zone postale (ex. H2J) : leur adresse exacte reste privée jusqu’à l’acceptation.')}</Text>
        <Button title={t('Chercher')} icon="search-outline" size="md" onPress={search} loading={busy} />
      </View>
    </Modal>
  );
}

const styles = createStyles(() => ({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: colors.overlay },
  sheet: { position: 'absolute', left: spacing.lg, right: spacing.lg, backgroundColor: colors.bg, borderRadius: radius.xl, padding: spacing.xl, gap: spacing.md, ...shadow.floating },
  field: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: spacing.md, minHeight: 50 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.ink, paddingVertical: spacing.sm },
}));
