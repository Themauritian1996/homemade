import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthScaffold } from '@/components/AuthScaffold';
import { Button, TextField } from '@/components/ui';
import { t } from '@/i18n';
import { friendlyError } from '@/lib/errors';
import { emailCodesEnabled, resendEmailCode, sendPasswordReset, signIn } from '@/services/auth';
import { useApp } from '@/store/app';
import { colors, fonts, spacing, type } from '@/theme';

export default function SignIn() {
  // Le dernier courriel utilisé est retenu sur ce téléphone ; le mot de passe, lui, reste au gestionnaire de mots de passe du téléphone.
  const [email, setEmail] = useState(useApp.getState().lastEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const cleanEmail = () => email.trim().toLowerCase();

  const submit = async () => {
    setError(undefined);
    if (!cleanEmail().includes('@') || password.length < 8) {
      setError(t('Courriel ou mot de passe invalide (8 caractères minimum).'));
      return;
    }
    setLoading(true);
    try {
      await signIn(cleanEmail(), password);
    } catch (e) {
      // Compte créé mais pas encore confirmé : on renvoie un code et on ouvre l'écran de saisie.
      if ((e as { code?: string })?.code === 'email_not_confirmed' || /not confirmed/i.test(String((e as Error)?.message))) {
        await resendEmailCode(cleanEmail(), 'signup').catch(() => {});
        router.push({ pathname: '/verify', params: { email: cleanEmail(), mode: 'signup' } });
        return;
      }
      setError(friendlyError(e, t('Connexion impossible.')));
    } finally {
      setLoading(false);
    }
  };

  const reset = async () => {
    setError(undefined);
    if (!cleanEmail().includes('@')) return setError(t('Entrez votre courriel pour recevoir un code.'));
    if (!(await emailCodesEnabled())) {
      Alert.alert(
        t('Mot de passe oublié'),
        t('La réinitialisation par courriel n’est pas encore activée pendant la bêta. Écrivez à la personne qui vous a invité : elle peut réinitialiser votre compte.'),
      );
      return;
    }
    try {
      await sendPasswordReset(cleanEmail());
    } catch (e) {
      return setError(friendlyError(e, t('Envoi impossible pour le moment.')));
    }
    router.push({ pathname: '/verify', params: { email: cleanEmail(), mode: 'recovery' } });
  };

  return (
    <AuthScaffold title={t('Bon retour 👋')} subtitle={t('Connectez-vous pour retrouver les plats et les cuisiniers de votre quartier.')}>
      <View style={{ gap: spacing.lg }}>
        <TextField
          label={t('Courriel')}
          icon="mail-outline"
          placeholder={t('vous@exemple.com')}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          importantForAutofill="yes"
          value={email}
          onChangeText={setEmail}
        />
        <View>
          <TextField
            label={t('Mot de passe')}
            icon="lock-closed-outline"
            placeholder="••••••••"
            secureTextEntry={!showPassword}
            autoComplete="current-password"
            textContentType="password"
            importantForAutofill="yes"
            value={password}
            onChangeText={setPassword}
            onSubmitEditing={submit}
            returnKeyType="go"
          />
          <Pressable
            onPress={() => setShowPassword(!showPassword)}
            style={{ position: 'absolute', right: spacing.md, bottom: 14 }}
            hitSlop={10}
            accessibilityLabel={showPassword ? t('Masquer le mot de passe') : t('Afficher le mot de passe')}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.muted} />
          </Pressable>
        </View>
        {error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
        <Pressable onPress={reset} style={{ alignSelf: 'flex-end' }} hitSlop={8} accessibilityRole="button">
          <Text style={{ fontFamily: fonts.semibold, color: colors.forest }}>{t('Mot de passe oublié ?')}</Text>
        </Pressable>
        <Button title={t('Se connecter')} onPress={submit} loading={loading} />
        <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center', justifyContent: 'center' }}>
          <Ionicons name="phone-portrait-outline" size={14} color={colors.muted} />
          <Text style={type.caption}>{t('Vous restez connecté sur ce téléphone jusqu’à la déconnexion.')}</Text>
        </View>
        <Pressable onPress={() => router.replace('/sign-up')} style={{ alignSelf: 'center', marginTop: spacing.md }} accessibilityRole="button">
          <Text style={type.body}>
            {t('Nouveau sur Homemade ?')} <Text style={{ fontFamily: fonts.semibold, color: colors.tomato }}>{t('Créer un compte')}</Text>
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}
