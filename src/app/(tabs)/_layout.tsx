import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';
import React from 'react';
import { ColorValue, Platform, StyleSheet, View } from 'react-native';
import { DEMO_MODE } from '@/lib/config';
import { colors, fonts, shadow } from '@/theme';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

const icon =
  (active: IconName, inactive: IconName) =>
  ({ focused, color }: { focused: boolean; color: ColorValue }) => <Ionicons name={focused ? active : inactive} size={23} color={color} />;

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.forest,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 11 },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          height: Platform.OS === 'ios' ? 88 : 68,
          paddingTop: 6,
          paddingBottom: Platform.OS === 'ios' ? 28 : 10,
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
      <Tabs.Screen name="inbox" options={{ title: 'Messages', tabBarIcon: icon('chatbubbles', 'chatbubbles-outline'), tabBarBadge: DEMO_MODE ? 1 : undefined, tabBarBadgeStyle: { backgroundColor: colors.tomato } }} />
      <Tabs.Screen name="profile" options={{ title: 'Profil', tabBarIcon: icon('person-circle', 'person-circle-outline') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  fab: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.tomato,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -22,
    borderWidth: 4,
    borderColor: colors.surface,
    ...shadow.floating,
  },
});
