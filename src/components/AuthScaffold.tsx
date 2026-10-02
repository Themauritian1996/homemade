import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';
import { colors, spacing, type } from '@/theme';
import { LanguageToggle } from './LanguageToggle';
import { IconButton, Logo } from './ui';
import { KEYBOARD_BEHAVIOR, useKeyboardAutoScroll } from '@/lib/useKeyboardAutoScroll';

export function AuthScaffold({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  const kb = useKeyboardAutoScroll();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={KEYBOARD_BEHAVIOR}>
      <ScrollView
        {...kb}
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.xxl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <IconButton icon="chevron-back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityLabel={t('Retour')} />
          <LanguageToggle />
        </View>
        <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xxl, gap: spacing.sm }}>
          <Logo size={28} />
          <Text style={type.h1}>{title}</Text>
          <Text style={type.body}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
