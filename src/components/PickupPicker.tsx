/**
 * Choix du point de cueillette à la publication : épingle déplaçable sur la carte.
 * Le point exact reste privé (révélé après acceptation) ; la carte publique le décale de 100 à 300 m.
 */
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import React, { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { colors, createStyles, radius, spacing, type } from '@/theme';
import type { GeoPoint } from '@/types';
import { LeafletMap, LeafletMapHandle } from './LeafletMap';
import { Button, TextField } from './ui';

import { t } from '@/i18n';
/** Quartier lisible à partir de coordonnées (jamais la rue : on ne publie qu'une zone approximative). */
async function neighborhoodOf(p: GeoPoint): Promise<string | null> {
  try {
    const [a] = await Location.reverseGeocodeAsync(p);
    if (!a) return null;
    const zone = a.district ?? a.subregion ?? null;
    return [zone, a.city].filter((x, i, l) => x && l.indexOf(x) === i).join(', ') || null;
  } catch {
    return null;
  }
}

export function PickupPicker({
  value,
  onChange,
  area,
  onAreaChange,
  onConfirmed,
  hideArea,
  autoLocate = true,
}: {
  value: GeoPoint;
  onChange: (p: GeoPoint) => void;
  area?: string;
  onAreaChange?: (s: string) => void;
  /** Appelé dès que le point reflète un vrai choix (position GPS ou épingle déplacée). */
  onConfirmed: () => void;
  /** Sans champ « repère public » (ex. adresse privée dans les Paramètres). */
  hideArea?: boolean;
  /** Se placer d'emblée sur la position GPS (faux si une adresse enregistrée est déjà affichée). */
  autoLocate?: boolean;
}) {
  const mapRef = useRef<LeafletMapHandle>(null);
  const [mapFailed, setMapFailed] = useState(false);
  const [locating, setLocating] = useState(false);
  const areaRef = useRef(area ?? '');
  areaRef.current = area ?? '';

  const fillArea = async (p: GeoPoint) => {
    if (hideArea || !onAreaChange || areaRef.current.trim()) return;
    const n = await neighborhoodOf(p);
    if (n && !areaRef.current.trim()) onAreaChange(n);
  };

  const useMyPosition = async (ask: boolean) => {
    setLocating(true);
    try {
      const perm = ask ? await Location.requestForegroundPermissionsAsync() : await Location.getForegroundPermissionsAsync();
      if (perm.status !== 'granted') return;
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      const p = { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
      onChange(p);
      onConfirmed();
      mapRef.current?.flyTo(p, 16);
      fillArea(p);
    } catch {
      // GPS indisponible : l'épingle reste déplaçable à la main.
    } finally {
      setLocating(false);
    }
  };

  // Position actuelle si la permission est déjà accordée (sans redemander).
  useEffect(() => {
    if (autoLocate) useMyPosition(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View style={{ gap: spacing.md }}>
      {!mapFailed && (
        <View style={styles.mapBox}>
          <LeafletMap
            ref={mapRef}
            center={value}
            zoom={15}
            pin={value}
            onPinChange={(p) => {
              onChange(p);
              onConfirmed();
              fillArea(p);
            }}
            onError={() => setMapFailed(true)}
          />
        </View>
      )}
      <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
        <Ionicons name="hand-left-outline" size={16} color={colors.muted} />
        <Text style={[type.caption, { flex: 1 }]}>
          {mapFailed ? t('Carte indisponible : utilisez votre position actuelle.') : t('Touchez la carte ou glissez l’épingle sur votre lieu de cueillette.')}
        </Text>
      </View>
      <Button
        title={t('Utiliser ma position actuelle')}
        variant="secondary"
        size="md"
        icon="navigate-outline"
        loading={locating}
        onPress={() => useMyPosition(true)}
      />
      {!hideArea && onAreaChange && (
        <TextField
          label={t('Repère public (facultatif)')}
          value={area}
          onChangeText={onAreaChange}
          placeholder={t('Ex. près du parc Laurier (sans adresse)')}
          icon="location-outline"
          maxLength={60}
        />
      )}
      <Text style={type.caption}>
        {t('Vos voisins voient seulement votre zone postale (ex. H2J) et un point approximatif (100 à 300 m). L’adresse exacte est partagée après acceptation de la commande (et paiement pour un achat).')}
      </Text>
    </View>
  );
}

const styles = createStyles(() => ({
  mapBox: { height: 220, borderRadius: radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: colors.border },
}));
