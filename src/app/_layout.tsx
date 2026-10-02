import { Fraunces_500Medium_Italic, Fraunces_600SemiBold } from '@expo-google-fonts/fraunces';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { StripeProvider } from '@stripe/stripe-react-native';
import { useFonts } from 'expo-font';
import { DarkTheme, DefaultTheme, router, Stack, ThemeProvider, useGlobalSearchParams, usePathname } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useRef } from 'react';
import { useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { config, DEMO_MODE } from '@/lib/config';
import { listenToAuth } from '@/services/auth';
import { useApp, useHydrated } from '@/store/app';
import { applyScheme, colors } from '@/theme';

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
  const lang = useApp((s) => s.lang);
  const themeMode = useApp((s) => s.themeMode);
  const system = useColorScheme();
  const scheme = themeMode === 'auto' ? (system === 'dark' ? 'dark' : 'light') : themeMode;
  // Avant le rendu des écrans : la palette active doit déjà être la bonne.
  applyScheme(scheme);
  const treeKey = `${lang}-${scheme}`;
  const base = scheme === 'dark' ? DarkTheme : DefaultTheme;
  const navTheme = {
    ...base,
    colors: { ...base.colors, primary: colors.forest, background: colors.bg, card: colors.surface, text: colors.ink, border: colors.border },
  };
  const onboarded = useApp((s) => s.onboarded);
  const hydrated = useHydrated();
  const ready = fontsLoaded && hydrated;

  // Changement de langue ou de thème : l'arbre est reconstruit (voir key) puis on revient sur l'écran où l'on était.
  const pathname = usePathname();
  const params = useGlobalSearchParams();
  const where = useRef({ pathname, params });
  const shownKey = useRef(treeKey);
  useEffect(() => {
    if (shownKey.current === treeKey) {
      where.current = { pathname, params };
      return;
    }
    shownKey.current = treeKey;
    const back = where.current;
    if (!back.pathname || back.pathname === '/') return;
    const id = setTimeout(() => router.replace({ pathname: back.pathname, params: back.params } as never), 50);
    return () => clearTimeout(id);
  });

  useEffect(() => listenToAuth(), []);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const tree = (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider value={navTheme}>
          <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
          {/* Changement de langue ou de thème : l'arbre est reconstruit pour que chaque écran se réaffiche. */}
          <Stack key={treeKey} screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
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
              <Stack.Screen name="settings" />
              <Stack.Screen name="people/[id]" />
              <Stack.Screen name="neighbours" />
              <Stack.Screen name="my-meals" />
              <Stack.Screen name="invite" />
              <Stack.Screen name="favorites" />
              <Stack.Screen name="help" />
              <Stack.Screen name="report" options={{ presentation: 'modal' }} />
              <Stack.Screen name="feedback" options={{ presentation: 'modal' }} />
            </Stack.Protected>
            {/* Accessibles avant et après connexion (lien depuis l'inscription). */}
            <Stack.Screen name="legal/[doc]" />
          </Stack>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );

  // Stripe n'est monté que si une clé publiable est fournie (sinon mode démo).
  if (DEMO_MODE || !config.stripePublishableKey) return tree;
  return (
    <StripeProvider publishableKey={config.stripePublishableKey} merchantIdentifier="merchant.app.homemade" urlScheme="homemade">
      {tree}
    </StripeProvider>
  );
}
