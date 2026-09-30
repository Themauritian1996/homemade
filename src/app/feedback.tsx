/** Commentaires des testeurs de la bêta (table beta_feedback, lue par l'équipe dans Supabase). */
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Chip, ScreenHeader } from '@/components/ui';
import { friendlyError } from '@/lib/errors';
import { FeedbackKind, sendFeedback } from '@/services/account';
import { useApp } from '@/store/app';
import { colors, fonts, radius, spacing, type } from '@/theme';

const KINDS: { id: FeedbackKind; label: string; emoji: string; placeholder: string }[] = [
  { id: 'bug', label: 'Un bogue', emoji: '🐞', placeholder: 'Qu’avez-vous fait, et que s’est-il passé ? (écran, bouton, message d’erreur…)' },
  { id: 'idea', label: 'Une idée', emoji: '💡', placeholder: 'Qu’est-ce qui rendrait Homemade plus utile pour vous ?' },
  { id: 'praise', label: 'J’adore', emoji: '❤️', placeholder: 'Qu’avez-vous aimé ?' },
  { id: 'other', label: 'Autre', emoji: '💬', placeholder: 'Votre message' },
];

export default function Feedback() {
  const insets = useSafeAreaInsets();
  const user = useApp((s) => s.user);
  const [kind, setKind] = useState<FeedbackKind>('bug');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const current = KINDS.find((k) => k.id === kind)!;

  const submit = async () => {
    if (!user || message.trim().length < 3) return;
    setSending(true);
    try {
      await sendFeedback(user.id, { kind, message });
      Alert.alert('Merci ! 🙏', 'Votre message a bien été transmis. Chaque retour compte pendant la bêta.');
      router.back();
    } catch (e) {
      Alert.alert('Envoi impossible', friendlyError(e));
    } finally {
      setSending(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScreenHeader title="Votre avis sur la bêta" modal />
      <ScrollView
        contentContainerStyle={{ padding: spacing.xl, paddingTop: spacing.sm, gap: spacing.lg, paddingBottom: insets.bottom + spacing.huge }}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={type.body}>Vous faites partie des premiers testeurs : dites-nous tout, même les petits détails.</Text>
        <View style={styles.wrap}>
          {KINDS.map((k) => (
            <Chip key={k.id} emoji={k.emoji} label={k.label} selected={kind === k.id} onPress={() => setKind(k.id)} />
          ))}
        </View>
        <TextInput
          value={message}
          onChangeText={setMessage}
          placeholder={current.placeholder}
          placeholderTextColor={colors.muted}
          multiline
          maxLength={2000}
          style={styles.input}
          autoFocus
        />
        <Button title="Envoyer" icon="send-outline" onPress={submit} loading={sending} disabled={message.trim().length < 3} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  input: {
    minHeight: 160,
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
