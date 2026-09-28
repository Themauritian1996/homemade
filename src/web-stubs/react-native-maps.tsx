/**
 * Stub web de react-native-maps (aperçu navigateur uniquement — l'app cible Android/iOS).
 * Affiche un fond de carte stylisé et place les marqueurs en projection équirectangulaire simple.
 */
import React, { forwardRef, useImperativeHandle } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';

type LatLng = { latitude: number; longitude: number };
type Region = LatLng & { latitudeDelta: number; longitudeDelta: number };
const Ctx = React.createContext<Region | null>(null);

interface MapProps {
  initialRegion?: Region;
  children?: React.ReactNode;
  style?: StyleProp<ViewStyle>;
}

const MapView = forwardRef<unknown, MapProps>(function MapView(
  { initialRegion, children, style },
  ref,
) {
  useImperativeHandle(ref, () => ({ animateToRegion: () => {} }));
  return (
    <View style={[style, { backgroundColor: '#EFE9DF', overflow: 'hidden' }]}>
      {[...Array(12)].map((_, i) => (
        <View key={`h${i}`} style={{ position: 'absolute', left: 0, right: 0, top: `${i * 9}%`, height: i % 3 ? 2 : 6, backgroundColor: '#FFFFFF' }} />
      ))}
      {[...Array(8)].map((_, i) => (
        <View key={`v${i}`} style={{ position: 'absolute', top: 0, bottom: 0, left: `${i * 14}%`, width: i % 2 ? 2 : 5, backgroundColor: '#FFFFFF' }} />
      ))}
      <View style={{ position: 'absolute', left: '55%', top: '12%', width: '30%', height: '22%', borderRadius: 40, backgroundColor: '#DCE7DF' }} />
      <Ctx.Provider value={initialRegion ?? null}>{children}</Ctx.Provider>
    </View>
  );
});

export function Marker({ coordinate, children, onPress }: { coordinate: LatLng; children?: React.ReactNode; onPress?: () => void } & Record<string, unknown>) {
  const r = React.useContext(Ctx);
  if (!r) return null;
  const left = ((coordinate.longitude - (r.longitude - r.longitudeDelta / 2)) / r.longitudeDelta) * 100;
  const top = (((r.latitude + r.latitudeDelta / 2) - coordinate.latitude) / r.latitudeDelta) * 100;
  return (
    <View style={{ position: 'absolute', left: `${left}%`, top: `${top}%`, transform: [{ translateX: '-50%' }, { translateY: '-50%' }] }} onTouchEnd={onPress}>
      {children}
    </View>
  );
}

export function Circle() {
  return null;
}

export default MapView;
