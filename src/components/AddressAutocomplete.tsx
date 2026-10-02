/**
 * Champ d'adresse avec suggestions pendant la frappe (OpenStreetMap / Photon, gratuit, sans clé).
 * Toucher une suggestion renvoie l'adresse et ses coordonnées ; on peut aussi garder le texte tapé.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { t } from '@/i18n';
import { AddressSuggestion, suggestAddresses } from '@/services/address';
import { useApp } from '@/store/app';
import { colors, createStyles, radius, spacing, type } from '@/theme';
import { TextField } from './ui';

export function AddressAutocomplete({
  value,
  onChangeText,
  onPick,
  label = t('Adresse'),
  placeholder = t('Ex. 1234 rue Rachel Est'),
}: {
  value: string;
  onChangeText: (s: string) => void;
  onPick: (s: AddressSuggestion) => void;
  label?: string;
  placeholder?: string;
}) {
  const near = useApp((s) => (s.hasRealLocation ? s.location : null));
  const [items, setItems] = useState<AddressSuggestion[]>([]);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const picked = useRef<string | null>(null);

  useEffect(() => {
    if (!open || value.trim().length < 3 || value === picked.current) {
      setItems([]);
      return;
    }
    let alive = true;
    // Petite pause : une requête quand on arrête de taper, pas à chaque lettre.
    const timer = setTimeout(() => {
      setBusy(true);
      suggestAddresses(value, near)
        .then((r) => alive && setItems(r))
        .catch(() => alive && setItems([]))
        .finally(() => alive && setBusy(false));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  return (
    <View style={{ gap: spacing.xs }}>
      <TextField
        label={label}
        value={value}
        onChangeText={(s) => {
          setOpen(true);
          onChangeText(s);
        }}
        placeholder={placeholder}
        icon="search-outline"
        maxLength={200}
        autoCorrect={false}
      />
      {busy && <ActivityIndicator color={colors.forest} style={{ alignSelf: 'flex-start' }} />}
      {items.length > 0 && (
        <View style={styles.list} accessibilityRole="list">
          {items.map((s, i) => (
            <Pressable
              key={`${s.label}-${i}`}
              style={({ pressed }) => [styles.row, i > 0 && styles.sep, pressed && { backgroundColor: colors.surfaceAlt }]}
              onPress={() => {
                picked.current = s.street ?? s.label;
                setItems([]);
                setOpen(false);
                onPick(s);
              }}
              accessibilityRole="button"
            >
              <Ionicons name="location-outline" size={18} color={colors.forest} />
              <Text style={[type.body, { flex: 1, color: colors.ink }]} numberOfLines={2}>
                {s.label}
              </Text>
            </Pressable>
          ))}
          <Text style={[type.caption, { fontSize: 11, padding: spacing.sm }]}>{t('Suggestions © OpenStreetMap')}</Text>
        </View>
      )}
    </View>
  );
}

const styles = createStyles(() => ({
  list: { backgroundColor: colors.surface, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.md, paddingVertical: spacing.md, minHeight: 48 },
  sep: { borderTopWidth: 1, borderTopColor: colors.border },
}));
