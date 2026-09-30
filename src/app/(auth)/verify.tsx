/**
 * Code reçu par courriel : confirmation d'un nouveau compte, ou mot de passe oublié.
 * Un code à 6 chiffres plutôt qu'un lien : rien à ouvrir, fonctionne sur tous les téléphones.
 */
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { AuthScaffold } from '@/components/AuthScaffold';
import { Button, TextField } from '@/components/ui';
import { t } from '@/i18n';
import { friendlyError } from '@/lib/errors';
import { CodeMode, resendEmailCode, updatePassword, verifyEmailCode } from '@/services/auth';
import { colors, fonts, spacing, type } from '@/theme';

export default function Verify() {
  const params = useLocalSearchParams<{ email?: string; mode?: string }>();
  const email = String(params.email ?? '');
  const mode: CodeMode = params.mode === 'recovery' ? 'recovery' : 'signup';
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    const digits = code.replace(/\D/g, '');
    if (digits.length < 6) return setError(t('Entrez le code à 6 chiffres reçu par courriel.'));
    if (mode === 'recovery' && password.length < 8) return setError(t('Le mot de passe doit contenir au moins 8 caractères.'));
    setLoading(true);
    try {
      await verifyEmailCode(email, digits, mode);
      // Session ouverte : pour un mot de passe oublié, on enregistre tout de suite le nouveau.
      if (mode === 'recovery') await updatePassword(password);
    } catch (e) {
      setError(friendlyError(e, t('Code invalide ou expiré.')));
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    try {
      await resendEmailCode(email, mode);
      Alert.alert(t('Nouveau code envoyé'), t('Vérifiez votre boîte de réception (et les indésirables).'));
    } catch (e) {
      Alert.alert(t('Envoi impossible'), friendlyError(e, t('Réessayez dans une minute.')));
    }
  };

  return (
    <AuthScaffold
      title={mode === 'signup' ? t('Vérifiez vos courriels') : t('Nouveau mot de passe')}
      subtitle={t('Nous avons envoyé un code à 6 chiffres à {email}.', { email })}
    >
      <View style={{ gap: spacing.lg }}>
        <TextField
          label={t('Code reçu par courriel')}
          icon="keypad-outline"
          placeholder="123456"
          keyboardType="number-pad"
          autoComplete="one-time-code"
          textContentType="oneTimeCode"
          maxLength={10}
          value={code}
          onChangeText={setCode}
          style={{ letterSpacing: 4, fontFamily: fonts.semibold, fontSize: 18 }}
        />
        {mode === 'recovery' && (
          <View>
            <TextField
              label={t('Nouveau mot de passe')}
              icon="lock-closed-outline"
              placeholder={t('8 caractères minimum')}
              secureTextEntry={!showPassword}
              autoComplete="new-password"
              textContentType="newPassword"
              value={password}
              onChangeText={setPassword}
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
        )}
        {error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
        <Button title={mode === 'signup' ? t('Confirmer mon compte') : t('Enregistrer et me connecter')} onPress={submit} loading={loading} />
        <Pressable onPress={resend} style={{ alignSelf: 'center', padding: spacing.sm }} accessibilityRole="button">
          <Text style={type.body}>
            {t('Pas reçu ?')} <Text style={{ fontFamily: fonts.semibold, color: colors.forest }}>{t('Renvoyer le code')}</Text>
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}
