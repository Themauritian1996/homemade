/**
 * Carte interactive (Android/iOS) : Leaflet + OpenStreetMap dans une WebView.
 * Fonctionne dans Expo Go comme dans l'APK autonome, sans clé Google Maps.
 */
import React, { forwardRef, useCallback, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { WebView } from 'react-native-webview';
import type { MapCommand } from '@/lib/mapHtml';
import { colors } from '@/theme';
import { LeafletMapHandle, LeafletMapProps, useMapBridge } from './mapBridge';

export type { LeafletMapHandle, LeafletMapProps } from './mapBridge';

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(props, ref) {
  const web = useRef<WebView>(null);
  const send = useCallback((c: MapCommand) => {
    web.current?.injectJavaScript(`window.__hmHandle && window.__hmHandle(${JSON.stringify(c)}); true;`);
  }, []);
  const { html, onEvent, loading, resetReady } = useMapBridge(props, ref, send);

  return (
    <View style={[styles.map, props.style]}>
      <WebView
        ref={web}
        style={styles.web}
        containerStyle={StyleSheet.absoluteFill}
        source={{ html, baseUrl: 'https://homemade.app/' }}
        originWhitelist={['*']}
        // Politique d'OpenStreetMap : les requêtes de tuiles identifient l'application.
        applicationNameForUserAgent="HomemadeBeta/1.0 (+https://github.com/Themauritian1996/homemade)"
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
        overScrollMode="never"
        bounces={false}
        nestedScrollEnabled
        scrollEnabled={false}
        onLoadStart={resetReady}
        onMessage={(e) => onEvent(e.nativeEvent.data)}
        onError={() => props.onError?.('webview')}
        // WebView d'Android relancée par le système (mémoire) : on recharge plutôt que d'afficher une page blanche.
        onRenderProcessGone={() => web.current?.reload()}
        // La carte n'ouvre jamais de page externe (liens d'attribution compris).
        onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:') || r.url.startsWith('https://homemade.app/')}
      />
      {loading && (
        <View style={styles.loading} pointerEvents="none">
          <ActivityIndicator color={colors.forest} />
        </View>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: colors.surfaceAlt, overflow: 'hidden' },
  web: { flex: 1, backgroundColor: colors.surfaceAlt },
  loading: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, alignItems: 'center', justifyContent: 'center' },
});
