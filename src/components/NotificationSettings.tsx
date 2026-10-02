/**
 * Paramètres → Notifications : autorisation du téléphone, choix des alertes, aperçu du texte (confidentialité par
 * défaut : désactivé), notification d'essai.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useState } from 'react';
import { Alert, AppState, Linking, Pressable, Switch, Text, View } from 'react-native';
import { t } from '@/i18n';
import { askNotificationPermission, notificationPermission, sendTestNotification } from '@/lib/notifications';
import type { Settings } from '@/services/account';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import { Button, Card, Divider } from './ui';

export function NotificationSettings({ settings, onChange }: { settings: Settings; onChange: (patch: Partial<Settings>) => void }) {
  const [perm, setPerm] = useState<'granted' | 'denied' | 'undetermined' | 'unsupported' | null>(null);
  const refresh = useCallback(() => {
    notificationPermission()
      .then(setPerm)
      .catch(() => setPerm('unsupported'));
  }, []);
  useEffect(() => {
    refresh();
    // Retour des réglages du téléphone : on relit l'autorisation.
    const sub = AppState.addEventListener('change', (s) => s === 'active' && refresh());
    return () => sub.remove();
  }, [refresh]);

  const allow = async () => {
    if (perm === 'denied') return Linking.openSettings();
    await askNotificationPermission();
    refresh();
  };
  const test = async () => {
    const ok = await sendTestNotification();
    if (!ok) Alert.alert(t('Notifications bloquées'), t('Autorisez les notifications de Homemade dans les réglages du téléphone.'));
  };

  return (
    <View style={{ gap: spacing.md }}>
      {perm && perm !== 'unsupported' && (
        <Pressable style={[styles.status, perm === 'granted' ? styles.ok : styles.off]} onPress={perm === 'granted' ? undefined : allow} accessibilityRole="button">
          <Ionicons name={perm === 'granted' ? 'notifications' : 'notifications-off-outline'} size={20} color={perm === 'granted' ? colors.forest : colors.tomato} />
          <View style={{ flex: 1 }}>
            <Text style={type.bodyStrong}>{perm === 'granted' ? t('Notifications autorisées sur ce téléphone') : t('Notifications désactivées sur ce téléphone')}</Text>
            {perm !== 'granted' && (
              <Text style={type.caption}>{perm === 'denied' ? t('Touchez pour ouvrir les réglages du téléphone.') : t('Touchez pour les autoriser.')}</Text>
            )}
          </View>
          {perm !== 'granted' && <Ionicons name="chevron-forward" size={18} color={colors.muted} />}
        </Pressable>
      )}
      <Card>
        <Row label={t('Messages et étapes de mes échanges')} hint={t('Demande, acceptation, adresse partagée, remise.')} value={settings.notifyMessages} onChange={(v) => onChange({ notifyMessages: v })} />
        <Divider />
        <Row
          label={t('Afficher le texte des messages')}
          hint={t('Désactivé : « Nouveau message de Camille », sans le contenu, même sur l’écran verrouillé.')}
          value={settings.notifyPreview}
          disabled={!settings.notifyMessages}
          onChange={(v) => onChange({ notifyPreview: v })}
        />
        <Divider />
        <Row label={t('Nouveaux plats près de chez moi')} hint={t('Bientôt disponible : votre choix sera respecté.')} value={settings.notifyNewNearby} onChange={(v) => onChange({ notifyNewNearby: v })} />
      </Card>
      {perm === 'granted' && <Button title={t('Envoyer une notification test')} variant="secondary" size="md" icon="notifications-outline" onPress={test} />}
    </View>
  );
}

function Row({ label, hint, value, onChange, disabled }: { label: string; hint?: string; value: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <View style={[styles.row, disabled && { opacity: 0.5 }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={styles.label}>{label}</Text>
        {hint && <Text style={type.caption}>{hint}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        trackColor={{ true: colors.forest, false: colors.border }}
        thumbColor={colors.surface}
        accessibilityLabel={label}
      />
    </View>
  );
}

const styles = createStyles(() => ({
  status: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, padding: spacing.md, borderRadius: radius.md, borderWidth: 1 },
  ok: { backgroundColor: colors.sage, borderColor: colors.sage },
  off: { backgroundColor: colors.tomatoSoft, borderColor: colors.tomato },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.xs, minHeight: 44 },
  label: { fontFamily: fonts.medium, fontSize: 15, color: colors.ink },
}));
