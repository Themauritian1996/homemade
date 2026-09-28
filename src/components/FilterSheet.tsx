/** Feuille de filtres partagée (Fil + Carte) : distance, cuisine, prix, régimes, mode achat/échange, tri. */
import Slider from '@react-native-community/slider';
import React, { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CUISINES, DIETS } from '@/data/allergens';
import { formatPrice } from '@/lib/format';
import { DEFAULT_FILTERS, FeedFilters } from '@/types';
import { colors, radius, spacing, type } from '@/theme';
import { Button, Chip, Divider } from './ui';

const PRICE_STEPS = [null, 800, 1000, 1200, 1500, 2000] as const;
const SORTS: { id: FeedFilters['sort']; label: string }[] = [
  { id: 'distance', label: 'Les plus proches' },
  { id: 'rating', label: 'Mieux notés' },
  { id: 'newest', label: 'Plus récents' },
  { id: 'price', label: 'Prix croissant' },
];

export function FilterSheet({
  visible,
  value,
  onClose,
  onApply,
}: {
  visible: boolean;
  value: FeedFilters;
  onClose: () => void;
  onApply: (f: FeedFilters) => void;
}) {
  const insets = useSafeAreaInsets();
  const [draft, setDraft] = useState(value);
  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={type.h2}>Filtres</Text>
          <Pressable onPress={() => setDraft(DEFAULT_FILTERS)} hitSlop={8}>
            <Text style={[type.bodyStrong, { color: colors.forest }]}>Réinitialiser</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={{ gap: spacing.xl, paddingBottom: spacing.xl }} showsVerticalScrollIndicator={false}>
          <View style={styles.group}>
            <Text style={type.label}>Mode</Text>
            <View style={styles.segment}>
              {(
                [
                  ['all', 'Tout'],
                  ['sale', 'Achat'],
                  ['swap', 'Échange'],
                ] as const
              ).map(([id, label]) => (
                <Pressable key={id} onPress={() => setDraft({ ...draft, mode: id })} style={[styles.segmentItem, draft.mode === id && styles.segmentActive]}>
                  <Text style={[type.bodyStrong, { fontSize: 14, color: draft.mode === id ? colors.onDark : colors.inkSoft }]}>{label}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <View style={styles.rowBetween}>
              <Text style={type.label}>Distance</Text>
              <Text style={type.bodyStrong}>{draft.radiusKm} km</Text>
            </View>
            <Slider
              minimumValue={1}
              maximumValue={25}
              step={1}
              value={draft.radiusKm}
              onValueChange={(v) => setDraft({ ...draft, radiusKm: v })}
              minimumTrackTintColor={colors.forest}
              maximumTrackTintColor={colors.border}
              thumbTintColor={colors.forest}
            />
          </View>

          <View style={styles.group}>
            <Text style={type.label}>Prix maximum</Text>
            <View style={styles.wrap}>
              {PRICE_STEPS.map((p) => (
                <Chip key={String(p)} label={p == null ? 'Tous' : `≤ ${formatPrice(p)}`} selected={draft.maxPriceCents === p} onPress={() => setDraft({ ...draft, maxPriceCents: p })} />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={type.label}>Type de cuisine</Text>
            <View style={styles.wrap}>
              {CUISINES.map((c) => (
                <Chip key={c.id} emoji={c.emoji} label={c.fr} selected={draft.cuisines.includes(c.id)} onPress={() => setDraft({ ...draft, cuisines: toggle(draft.cuisines, c.id) })} />
              ))}
            </View>
          </View>

          <View style={styles.group}>
            <Text style={type.label}>Régimes alimentaires</Text>
            <View style={styles.wrap}>
              {DIETS.map((d) => (
                <Chip key={d.id} label={d.fr} selected={draft.diets.includes(d.id)} onPress={() => setDraft({ ...draft, diets: toggle(draft.diets, d.id) })} />
              ))}
            </View>
            <Text style={type.caption}>Vos allergies sont déjà exclues automatiquement via votre profil santé.</Text>
          </View>

          <Divider />
          <View style={styles.group}>
            <Text style={type.label}>Trier par</Text>
            <View style={styles.wrap}>
              {SORTS.map((s) => (
                <Chip key={s.id} label={s.label} selected={draft.sort === s.id} onPress={() => setDraft({ ...draft, sort: s.id })} />
              ))}
            </View>
          </View>
        </ScrollView>
        <Button
          title="Afficher les repas"
          onPress={() => {
            onApply(draft);
            onClose();
          }}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    maxHeight: '88%',
    backgroundColor: colors.bg,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: spacing.lg },
  group: { gap: spacing.md },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  segment: { flexDirection: 'row', backgroundColor: colors.surfaceAlt, borderRadius: radius.md, padding: 4 },
  segmentItem: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: radius.sm },
  segmentActive: { backgroundColor: colors.forest },
});
