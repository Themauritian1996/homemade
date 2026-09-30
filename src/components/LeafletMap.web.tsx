/** Carte interactive — aperçu web : même page Leaflet, dans une iframe. */
import React, { forwardRef, useCallback, useEffect, useRef } from 'react';
import { View } from 'react-native';
import type { MapCommand } from '@/lib/mapHtml';
import { colors } from '@/theme';
import { LeafletMapHandle, LeafletMapProps, useMapBridge } from './mapBridge';

export type { LeafletMapHandle, LeafletMapProps } from './mapBridge';

export const LeafletMap = forwardRef<LeafletMapHandle, LeafletMapProps>(function LeafletMap(props, ref) {
  const frame = useRef<HTMLIFrameElement | null>(null);
  const send = useCallback((c: MapCommand) => {
    frame.current?.contentWindow?.postMessage({ __hm: true, command: c }, '*');
  }, []);
  const { html, onEvent } = useMapBridge(props, ref, send);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source === frame.current?.contentWindow && e.data?.__hm && typeof e.data.payload === 'string') onEventRef.current(e.data.payload);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, []);

  return (
    <View style={[{ flex: 1, backgroundColor: colors.surfaceAlt, overflow: 'hidden' }, props.style]}>
      <iframe ref={frame} srcDoc={html} title="Carte" style={{ border: 0, width: '100%', height: '100%' }} />
    </View>
  );
});
