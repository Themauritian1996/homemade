import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { config, DEMO_MODE } from '@/lib/config';
import { listenToAuth } from '@/services/auth';
import { useApp, useHydrated } from '@/store/app';
import { colors } from '@/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    Fraunces_600SemiBold,
    Fraunces_500Medium_Italic,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
  });
  const user = useApp((s) => s.user);
  const onboarded = useApp((s) => s.onboarded);
  const hydrated = useHydrated();
  const ready = fontsLoaded && hydrated;

  useEffect(() => listenToAuth(), []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const tree = (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
        {/* Garde d'accès : sans session → écrans d'authentification uniquement. */}
        <Stack.Protected guard={!user}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && !onboarded}>
          <Stack.Screen name="onboarding" />
        </Stack.Protected>
        <Stack.Protected guard={!!user && onboarded}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="meal/[id]" />
          <Stack.Screen name="chat/[id]" />
          <Stack.Screen name="order/[id]" options={{ presentation: 'modal' }} />
          <Stack.Screen name="health" options={{ presentation: 'modal' }} />
          <Stack.Screen name="review/[orderId]" options={{ presentation: 'modal' }} />
        </Stack.Protected>
      </Stack>
    </SafeAreaProvider>
  );

  // Stripe n'est monté que si une clé publiable est fournie (sinon mode démo).
  if (DEMO_MODE || !config.stripePublishableKey) return tree;
  return (
    <StripeProvider publishableKey={config.stripePublishableKey} merchantIdentifier="merchant.app.homemade" urlScheme="homemade">
      {tree}
    </StripeProvider>
  );
}
