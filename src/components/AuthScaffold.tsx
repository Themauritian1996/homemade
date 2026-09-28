import { router } from 'expo-router';
import React from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, type } from '@/theme';
import { IconButton } from './ui';

export function AuthScaffold({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + spacing.md, paddingBottom: insets.bottom + spacing.xl, paddingHorizontal: spacing.xxl, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <IconButton icon="chevron-back" onPress={() => router.back()} accessibilityLabel="Retour" />
        <View style={{ marginTop: spacing.xxl, marginBottom: spacing.xxl, gap: spacing.sm }}>
          <Text style={type.h1}>{title}</Text>
          <Text style={type.body}>{subtitle}</Text>
        </View>
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
