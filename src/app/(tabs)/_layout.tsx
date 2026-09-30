import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { useSessionSync } from '@/lib/useSessionSync';
import { useApp } from '@/store/app';
import { colors, fonts, radius, shadow } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// Onglet actif : icône pleine sur une pastille vert sauge (indicateur moderne façon Material 3).
const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, color }: { focused: boolean; color: ColorValue }) => (
    <View style={[styles.indicator, focused && styles.indicatorActive]}>
      <Ionicons name={focused ? active : inactive} size={22} color={color} />
    </View>
  );

export default function TabsLayout() {
  useSessionSync();
  const unread = useApp((s) => s.unread);
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, marginTop: 2 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopWidth: 0,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          height: Platform.OS === 'ios' ? 90 : 72,
          paddingTop: 8,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
          ...shadow.floating,
        },
        sceneStyle: { backgroundColor: colors.bg },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Découvrir', tabBarIcon: icon('restaurant', 'restaurant-outline') }} />
      <Tabs.Screen name="map" options={{ title: 'Carte', tabBarIcon: icon('map', 'map-outline') }} />
      <Tabs.Screen
        name="publish"
        options={{
          title: 'Publier',
          tabBarIcon: () => (
            <View style={styles.fab}>
              <Ionicons name="camera" size={24} color={colors.onDark} />
            </View>
          ),
          tabBarLabelStyle: { fontFamily: fonts.semibold, fontSize: 11, color: colors.tomato },
        }}
      />
      <Tabs.Screen
        name="inbox"
        options={{
          title: 'Messages',
          tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'),
          tabBarBadge: unread > 0 ? (unread > 9 ? '9+' : unread) : undefined,
          tabBarBadgeStyle: { backgroundColor: colors.tomato },
        }}
      />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  indicator: { width: 56, height: 30, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center' },
  indicatorActive: { backgroundColor: colors.sage },
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.tomato,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -26,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.floating,
  },
});
