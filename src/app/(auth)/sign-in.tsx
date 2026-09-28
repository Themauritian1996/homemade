import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthScaffold } from '@/components/AuthScaffold';
import { Button, TextField } from '@/components/ui';
import { sendPasswordReset, signIn } from '@/services/auth';
import { colors, fonts, spacing, type } from '@/theme';

export default function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    if (!email.includes('@') || password.length < 8) {
      setError('Courriel ou mot de passe invalide (8 caractères minimum).');
      return;
    }
    setLoading(true);
    try {
      await signIn(email.trim().toLowerCase(), password);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Connexion impossible.');
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    if (!email.includes('@')) return setError('Entrez votre courriel pour recevoir le lien.');
    await sendPasswordReset(email.trim().toLowerCase()).catch(() => {});
    Alert.alert('Courriel envoyé', 'Si un compte existe, vous recevrez un lien de réinitialisation.');
  };

  return (
    <AuthScaffold title="Bon retour 👋" subtitle="Connectez-vous pour retrouver les plats de votre quartier.">
      <View style={{ gap: spacing.lg }}>
        <TextField label="Courriel" icon="mail-outline" placeholder="vous@exemple.com" autoCapitalize="none" keyboardType="email-address" autoComplete="email" value={email} onChangeText={setEmail} />
        <TextField label="Mot de passe" icon="lock-closed-outline" placeholder="••••••••" secureTextEntry autoComplete="password" value={password} onChangeText={setPassword} error={error} />
        <Pressable onPress={reset} style={{ alignSelf: 'flex-end' }} hitSlop={8}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.forest }}>Mot de passe oublié ?</Text>
        </Pressable>
        <Button title="Se connecter" onPress={submit} loading={loading} />
        <Pressable onPress={() => router.replace('/sign-up')} style={{ alignSelf: 'center', marginTop: spacing.md }}>
          <Text style={type.body}>
            Nouveau sur Homemade ? <Text style={{ fontFamily: fonts.semibold, color: colors.tomato }}>Créer un compte</Text>
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}
