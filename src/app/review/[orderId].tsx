/**
 * Avis bidirectionnel après cueillette. Double-aveugle : l'avis n'est visible par l'autre partie
 * qu'une fois les deux avis soumis (ou après 7 jours) — pas de représailles, avis plus honnêtes.
 */
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, IconButton, Stars } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { submitReview } from '@/services/orders';
import { colors, fonts, radius, spacing, type } from '@/theme';

import { t } from '@/i18n';
// Rôle affiché : ici l'Eater note le Cooker. L'écran symétrique (Cooker → Eater) utilise EATER_CRITERIA.
const COOKER_CRITERIA = [
  { id: 'taste', label: 'Goût' },
  { id: 'hygiene', label: 'Hygiène & emballage' },
  { id: 'accuracy', label: 'Conforme à l’annonce' },
  { id: 'punctuality', label: 'Ponctualité' },
];
const TAGS = ['Généreux', 'Savoureux', 'Bien emballé', 'Sympathique', 'Ponctuel', 'Sain', 'Comme à la maison'];

export default function ReviewModal() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const insets = useSafeAreaInsets();
  const [rating, setRating] = useState(0);
  const [sub, setSub] = useState<Record<string, number>>({});
  const [tags, setTags] = useState<string[]>([]);
  const [comment, setComment] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (rating === 0) return Alert.alert(t('Note requise'), t('Choisissez une note globale.'));
    setLoading(true);
    try {
      await submitReview({ orderId, rating, comment, tags, subScores: sub });
      Alert.alert(t('Merci !'), t('Votre avis sera publié dès que les deux parties auront noté l’échange.'));
      router.back();
    } catch (e) {
      Alert.alert(t('Avis non enregistré'), friendlyError(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: spacing.xl, paddingTop: insets.top + spacing.md }}>
        <Text style={type.h2}>{t('Comment c\'était ?')}</Text>
        <IconButton icon="close" onPress={() => router.back()} accessibilityLabel={t('Fermer')} />
      </View>
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xxl, paddingBottom: 140 }}>
        <View style={{ alignItems: 'center', gap: spacing.md }}>
          <Text style={type.body}>{t('Votre note globale')}</Text>
          <Stars value={rating} size={40} onChange={setRating} />
        </View>
        <View style={{ gap: spacing.lg }}>
          {COOKER_CRITERIA.map((c) => (
            <View key={c.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={[type.bodyStrong, { flex: 1 }]}>{t(c.label)}</Text>
              <Stars value={sub[c.id] ?? 0} size={22} onChange={(v) => setSub({ ...sub, [c.id]: v })} />
            </View>
          ))}
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm }}>
          {TAGS.map((tag) => (
            <Chip key={tag} label={t(tag)} selected={tags.includes(tag)} onPress={() => setTags(tags.includes(tag) ? tags.filter((x) => x !== tag) : [...tags, tag])} />
          ))}
        </View>
        <TextInput
          value={comment}
          onChangeText={setComment}
          placeholder={t('Racontez votre expérience (optionnel)')}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={600}
          style={{ minHeight: 110, backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border, textAlignVertical: 'top' }}
        />
        <Text style={type.caption}>{t('Un problème d\'hygiène ou d\'allergène ? Signalez-le depuis l\'aide : notre équipe le traite en priorité.')}</Text>
      </ScrollView>
      <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: spacing.xl, paddingBottom: insets.bottom + spacing.md, backgroundColor: colors.bg }}>
        <Button title={t('Publier mon avis')} onPress={submit} loading={loading} />
      </View>
    </View>
  );
}
