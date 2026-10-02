import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { AuthScaffold } from '@/components/AuthScaffold';
import { Button, TextField } from '@/components/ui';
import { DEMO_MODE } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { checkInviteCode, signUp } from '@/services/auth';
import { colors, createStyles, fonts, spacing, type } from '@/theme';

import { t } from '@/i18n';
export default function SignUp() {
  // Lien d'invitation partagé : homemade://sign-up?code=HM-XXXXXX
  const params = useLocalSearchParams<{ code?: string }>();
  const [code, setCode] = useState(params.code ?? '');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async () => {
    setError(undefined);
    if (name.trim().length < 2) return setError(t('Indiquez votre prénom.'));
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError(t('Courriel invalide.'));
    if (password.length < 8) return setError(t('Le mot de passe doit contenir au moins 8 caractères.'));
    if (!accepted) return setError(t('Veuillez accepter les conditions et la politique de confidentialité.'));
    setLoading(true);
    try {
      const invite = await checkInviteCode(code);
      if (invite.required && !invite.valid) {
        setError(code.trim() ? friendlyError('INVITE_CODE_INVALID') : t('Homemade est en bêta fermée : entrez le code d’invitation reçu d’un proche.'));
        return;
      }
      const { needsEmailConfirmation } = await signUp({ email: email.trim().toLowerCase(), password, displayName: name.trim(), inviteCode: code });
      // Courriels actifs : le compte se confirme avec le code à 6 chiffres reçu.
      if (needsEmailConfirmation) router.replace({ pathname: '/verify', params: { email: email.trim().toLowerCase(), mode: 'signup' } });
    } catch (e) {
      setError(friendlyError(e, t('Inscription impossible.')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScaffold title={t('Rejoignez la table')} subtitle={t('Un seul compte pour manger (Eater) et cuisiner (Cooker).')}>
      <View style={{ gap: spacing.lg }}>
        {!DEMO_MODE && (
          <View style={{ gap: spacing.xs }}>
            <TextField
              label={t('Code d’invitation')}
              icon="ticket-outline"
              placeholder={t('Ex. VOISINS2026')}
              autoCapitalize="characters"
              autoCorrect={false}
              value={code}
              onChangeText={(v) => setCode(v.toUpperCase())}
            />
            <Text style={type.caption}>{t('Bêta fermée : le code vous a été transmis par la personne qui vous invite.')}</Text>
          </View>
        )}
        <TextField label={t('Prénom')} icon="person-outline" placeholder={t('Camille')} autoComplete="given-name" value={name} onChangeText={setName} maxLength={40} />
        <TextField
          label={t('Courriel')}
          icon="mail-outline"
          placeholder={t('vous@exemple.com')}
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          textContentType="username"
          value={email}
          onChangeText={setEmail}
        />
        <View>
          <TextField
            label={t('Mot de passe')}
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
        <Pressable
          onPress={() => setAccepted(!accepted)}
          style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'flex-start' }}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: accepted }}
        >
          <Ionicons name={accepted ? 'checkbox' : 'square-outline'} size={22} color={accepted ? colors.forest : colors.muted} />
          <Text style={[type.caption, { flex: 1, color: colors.inkSoft }]}>{t('J\'accepte les')}{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'terms' } })}>{t('conditions d\'utilisation')}</Text>{' '}{t('et la')}{' '}
            <Text style={styles.link} onPress={() => router.push({ pathname: '/legal/[doc]', params: { doc: 'privacy' } })}>{t('politique de confidentialité')}</Text>{t('. Mes données santé (allergies) servent uniquement à filtrer les repas (Loi 25).')}</Text>
        </Pressable>
        {error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
        <Button title={t('Créer mon compte')} variant="accent" onPress={submit} loading={loading} />
        <Pressable onPress={() => router.replace('/sign-in')} style={{ alignSelf: 'center', marginTop: spacing.md }}>
          <Text style={type.body}>{t('Déjà membre ?')}{' '}<Text style={{ fontFamily: fonts.semibold, color: colors.forest }}>{t('Se connecter')}</Text>
          </Text>
        </Pressable>
      </View>
    </AuthScaffold>
  );
}

const styles = createStyles(() => ({ link: { fontFamily: fonts.semibold, color: colors.forest, textDecorationLine: 'underline' as const } }));
