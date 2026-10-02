/** Bêta fermée : chaque membre dispose d'un code personnel pour inviter jusqu'à 5 voisins. */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ScreenHeader } from '@/components/ui';
import { config } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { fetchMyInvite, MyInvite } from '@/services/account';
import { colors, createStyles, fonts, radius, shadow, spacing, type } from '@/theme';

import { t } from '@/i18n';
export default function Invite() {
  const insets = useSafeAreaInsets();
  const [invite, setInvite] = useState<MyInvite | null>(null);

  useEffect(() => {
    fetchMyInvite()
      .then(setInvite)
      .catch((e) => Alert.alert(t('Code indisponible'), friendlyError(e)));
  }, []);

  const share = () => {
    if (!invite) return;
    const lines = [
      t('Je teste Homemade : des voisins qui aiment cuisiner partagent leurs plats et meal preps avec ceux qui aiment bien manger 🍲 Plus sain, moins de gaspillage !'),
      t('Ton code d’invitation : {code}', { code: invite.code }),
      config.betaDownloadUrl ? t('Installer l’app (Android) : {url}', { url: config.betaDownloadUrl }) : null,
      t('Déjà installée ? Ouvre ce lien : {link}', { link: `homemade://sign-up?code=${invite.code}` }),
    ];
    Share.share({ message: lines.filter(Boolean).join('\n') }).catch(() => {});
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScreenHeader title={t('Inviter des voisins')} />
      <ScrollView contentContainerStyle={{ padding: spacing.xl, gap: spacing.xl, paddingBottom: insets.bottom + spacing.huge }}>
        <Text style={type.body}>{t('Homemade est en bêta fermée. Plus il y a de cuisiniers autour de vous, plus il y a de bons plats à échanger : invitez les voisins, collègues et amis qui aiment cuisiner.')}</Text>
        <View style={styles.codeCard}>
          <Text style={[type.label, { color: 'rgba(255,255,255,0.75)' }]}>{t('Votre code d\'invitation')}</Text>
          {invite ? (
            <Text style={styles.code} selectable>
              {invite.code}
            </Text>
          ) : (
            <ActivityIndicator color={colors.onDark} style={{ marginVertical: spacing.lg }} />
          )}
          {invite && (
            <Text style={[type.caption, { color: 'rgba(255,255,255,0.8)' }]}>
              {invite.remaining > 0
                ? t('{0} invitation(s) restante(s) sur {1}', { 0: invite.remaining, 1: invite.maxUses })
                : t('Toutes vos invitations ont été utilisées. Merci !')}
            </Text>
          )}
        </View>
        <Button title={t('Partager mon invitation')} variant="accent" icon="share-social-outline" onPress={share} disabled={!invite || invite.remaining === 0} />
        <View style={styles.steps}>
          {[
            [
              'download-outline',
              config.betaDownloadUrl
                ? 'Votre invité installe l’app avec le lien partagé.'
                : 'Votre invité installe l’app de test (demandez le lien à l’organisateur de la bêta).',
            ],
            ['person-add-outline', 'Il crée son compte avec votre code.'],
            ['restaurant-outline', 'Vous voyez ses plats près de chez vous !'],
          ].map(([icon, text]) => (
            <View key={text} style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
              <View style={styles.stepIcon}>
                <Ionicons name={icon as React.ComponentProps<typeof Ionicons>['name']} size={18} color={colors.forest} />
              </View>
              <Text style={[type.body, { flex: 1 }]}>{t(text)}</Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = createStyles(() => ({
  codeCard: { backgroundColor: colors.forest, borderRadius: radius.xl, padding: spacing.xxl, alignItems: 'center', gap: spacing.sm, ...shadow.floating },
  code: { fontFamily: fonts.bold, fontSize: 34, letterSpacing: 3, color: colors.onDark },
  steps: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.lg },
  stepIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
}));
