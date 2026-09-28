import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthScaffold } from '@/components/AuthScaffold';
import { Button, TextField } from '@/components/ui';
import { signUp } from '@/services/auth';
import { colors, fonts, spacing, type } from '@/theme';

export default function SignUp() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    if (name.trim().length < 2) return setError('Indiquez votre prénom.');
    if (!email.includes('@')) return setError('Courriel invalide.');
    if (password.length < 8) return setError('Le mot de passe doit contenir au moins 8 caractères.');
    if (!accepted) return setError('Veuillez accepter les conditions et la politique de confidentialité.');
    setLoading(true);
    try {
      const { needsEmailConfirmation } = await signUp({ email: email.trim().toLowerCase(), password, displayName: name.trim() });
      if (needsEmailConfirmation) {
        Alert.alert('Vérifiez vos courriels', 'Nous vous avons envoyé un lien de confirmation pour activer votre compte.');
        router.replace('/sign-in');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Inscription impossible.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold title="Rejoignez la table" subtitle="Un seul compte pour manger (Eater) et cuisiner (Cooker).">
      <View style={{ gap: spacing.lg }}>
        <TextField label="Prénom" icon="person-outline" placeholder="Camille" autoComplete="given-name" value={name} onChangeText={setName} />
        <TextField label="Courriel" icon="mail-outline" placeholder="vous@exemple.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <TextField label="Mot de passe" icon="lock-closed-outline" placeholder="8 caractères minimum" secureTextEntry autoComplete="new-password" value={password} onChangeText={setPassword} />
        <Pressable onPress={() => setAccepted(!accepted)} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}>
          <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={22} color={accepted ? colors.forest : colors.muted} />
          <Text style={[type.caption, { flex: 1, color: colors.inkSoft }]}>
            J'accepte les conditions d'utilisation et la politique de confidentialité. Mes données santé (allergies) sont utilisées uniquement pour filtrer les repas (Loi 25).
          </Text>
        </Pressable>
        {error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
        <Button title="Créer mon compte" variant="accent" onPress={submit} loading={loading} />
        <Pressable onPress={() => router.replace('/sign-in')} style={{ alignSelf: 'center', marginTop: spacing.md }}>
          <Text style={type.body}>
            Déjà membre ? <Text style={{ fontFamily: fonts.semibold, color: colors.forest }}>Se connecter</Text>
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}
