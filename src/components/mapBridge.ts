/** Logique commune aux deux rendus de la carte (WebView native, iframe web). */
import { useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { buildMapHtml, MapCommand, MapEvent, MapMarker, MapState } from '@/lib/mapHtml';
import type { GeoPoint } from '@/types';

export interface LeafletMapHandle {
  flyTo: (p: GeoPoint, zoom?: number) => void;
  /** Cadre la carte sur ces points ; `top`/`bottom` = hauteur (px) masquée par l'interface. */
  fit: (points: GeoPoint[], inset?: { top?: number; bottom?: number }) => void;
}

export interface LeafletMapProps {
  /** Centre initial (ensuite, utiliser flyTo). */
  center: GeoPoint;
  zoom?: number;
  markers?: MapMarker[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  circle?: MapState['circle'];
  user?: GeoPoint | null;
  pin?: GeoPoint | null;
  onPinChange?: (p: GeoPoint) => void;
  /** Leaflet ou le fond de carte n'a pas pu être chargé (hors ligne…). */
  onError?: (reason: string) => void;
  style?: StyleProp<ViewStyle>;
}

/** Au-delà, la carte est considérée comme bloquée (WebView lente, réseau coupé) : l'écran propose la liste. */
const READY_TIMEOUT_MS = 15_000;

export function useMapBridge(props: LeafletMapProps, ref: React.Ref<LeafletMapHandle>, send: (c: MapCommand) => void) {
  const ready = useRef(false);
  const [loading, setLoading] = useState(true);
  // Déplacement demandé avant le chargement de la carte : rejoué dès qu'elle est prête.
  const pending = useRef<MapCommand | null>(null);
  const move = (c: MapCommand) => {
    if (ready.current) send(c);
    else pending.current = c;
  };
  const latest = useRef(props);
  latest.current = props;

  useEffect(() => {
    const timer = setTimeout(() => {
      if (!ready.current) latest.current.onError?.('timeout');
    }, READY_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, []);

  // HTML construit une seule fois : les changements passent ensuite par des messages (pas de rechargement).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const html = useMemo(() => buildMapHtml(props.center, props.zoom ?? 14), []);

  const state: MapState = {
    markers: props.markers ?? [],
    selectedId: props.selectedId ?? null,
    circle: props.circle ?? null,
    user: props.user ?? null,
    pin: props.pin ?? null,
  };
  const stateKey = JSON.stringify(state);
  useEffect(() => {
    if (ready.current) send({ cmd: 'update', state: JSON.parse(stateKey) as MapState });
  }, [stateKey, send]);

  useImperativeHandle(ref, () => ({
    flyTo: (p, zoom) => move({ cmd: 'flyTo', lat: p.latitude, lng: p.longitude, zoom }),
    fit: (points, inset) => move({ cmd: 'fit', points, top: inset?.top ?? 40, bottom: inset?.bottom ?? 40 }),
  }));

  const onEvent = (raw: string) => {
    let e: MapEvent;
    try {
      e = JSON.parse(raw) as MapEvent;
    } catch {
      return;
    }
    const p = latest.current;
    if (e.type === 'ready') {
      ready.current = true;
      setLoading(false);
      send({ cmd: 'update', state: JSON.parse(stateKey) as MapState });
      if (pending.current) send(pending.current);
      pending.current = null;
    } else if (e.type === 'select') p.onSelect?.(e.id);
    else if (e.type === 'pick') p.onPinChange?.({ latitude: e.lat, longitude: e.lng });
    else if (e.type === 'error') p.onError?.(e.reason);
  };

  return { html, onEvent, loading, resetReady: () => (ready.current = false) };
}
