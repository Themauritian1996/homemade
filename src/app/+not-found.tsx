import { router } from 'expo-router';
import React from 'react';
import { View } from 'react-native';
import { Button, EmptyState } from '@/components/ui';
import { colors, spacing } from '@/theme';

import { t } from '@/i18n';
export default function NotFound() {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: spacing.xxl }}>
      <EmptyState icon="restaurant-outline" title={t('Ce plat n\'est plus au menu')} body={t('La page demandée n\'existe pas ou n\'est plus disponible.')}>
        <Button title={t('Retour à l\'accueil')} onPress={() => router.replace('/')} style={{ alignSelf: 'stretch', marginTop: spacing.lg }} />
      </EmptyState>
    </View>
  );
}
