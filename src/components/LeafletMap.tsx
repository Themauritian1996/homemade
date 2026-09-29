/**
 * Carte interactive (Android/iOS) : Leaflet + OpenStreetMap dans une WebView.
 * Fonctionne dans Expo Go comme dans l'APK autonome, sans clé Google Maps.
 */
import React, { forwardRef, useCallback, useRef } from 'react';
import { StyleSheet } from 'react-native';
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
  const { html, onEvent, resetReady } = useMapBridge(props, ref, send);

  return (
    <WebView
      ref={web}
      style={[styles.map, props.style]}
      containerStyle={props.style}
      source={{ html, baseUrl: 'https://homemade.app/' }}
      originWhitelist={['*']}
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
      // La carte n'ouvre jamais de page externe (liens d'attribution compris).
      onShouldStartLoadWithRequest={(r) => r.url.startsWith('about:') || r.url.startsWith('https://homemade.app/')}
    />
  );
});

const styles = StyleSheet.create({ map: { flex: 1, backgroundColor: colors.surfaceAlt } });
