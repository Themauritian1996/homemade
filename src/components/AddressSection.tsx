/**
 * Paramètres → adresse de cueillette PRIVÉE : adresse + code postal, placée sur la carte.
 * Publiquement : zone postale (« H2J ») et point approximatif. L'adresse exacte est révélée après acceptation.
 */
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, View } from 'react-native';
import { t } from '@/i18n';
import { config } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { geocode, getMyAddress, normalizePostalCode, saveMyAddress } from '@/services/address';
import { colors, radius, spacing, type } from '@/theme';
import type { GeoPoint } from '@/types';
import { PickupPicker } from './PickupPicker';
import { Button, TextField } from './ui';

export function AddressSection() {
  const [loading, setLoading] = useState(true);
  const [address, setAddress] = useState('');
  const [postal, setPostal] = useState('');
  const [point, setPoint] = useState<GeoPoint | null>(null);
  const [savedZone, setSavedZone] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [mapKey, setMapKey] = useState(0);
  const [gps, setGps] = useState(false);

  useEffect(() => {
    getMyAddress()
      .then((a) => {
        if (!a) return;
        setAddress(a.address ?? '');
        setPostal(a.postalCode ?? '');
        setSavedZone(a.zone);
        if (a.latitude != null && a.longitude != null) setPoint({ latitude: a.latitude, longitude: a.longitude });
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const locate = async () => {
    if (!address.trim() && !postal.trim()) return Alert.alert(t('Adresse'), t('Entrez votre adresse et votre code postal.'));
    setSearching(true);
    try {
      const hit = await geocode([address, postal].filter((x) => x.trim()).join(', '));
      if (!hit) return Alert.alert(t('Adresse introuvable'), t('Vérifiez l’adresse, ou placez l’épingle vous-même sur la carte.'));
      setGps(false);
      setPoint({ latitude: hit.latitude, longitude: hit.longitude });
      if (!postal.trim() && hit.postalCode) setPostal(hit.postalCode);
      setMapKey((k) => k + 1);
    } finally {
      setSearching(false);
    }
  };

  const save = async () => {
    const normalized = normalizePostalCode(postal);
    if (!normalized) return Alert.alert(t('Code postal'), t('Entrez un code postal canadien complet (ex. H2J 1A1).'));
    if (!point) return Alert.alert(t('Adresse'), t('Touchez « Trouver sur la carte », puis vérifiez l’épingle.'));
    setSaving(true);
    try {
      const saved = await saveMyAddress(address.trim(), normalized, point);
      setPostal(saved.postalCode ?? normalized);
      setSavedZone(saved.zone);
      Alert.alert(t('Adresse enregistrée'), t('Vos voisins verront seulement la zone {zone}. Vos prochains plats seront placés à cette adresse.', { zone: saved.zone ?? '' }));
    } catch (e) {
      Alert.alert(t('Enregistrement impossible'), friendlyError(e));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <ActivityIndicator color={colors.forest} />;

  return (
    <View style={{ gap: spacing.md }}>
      <View style={styles.privacy}>
        <Ionicons name="lock-closed" size={16} color={colors.forest} />
        <Text style={[type.caption, { flex: 1, color: colors.forest }]}>
          {t('Privée. Publiquement : votre zone postale ({zone}) et un point approximatif. L’adresse est donnée à l’acheteur seulement après votre acceptation (et son paiement).', {
            zone: savedZone ?? 'H2J',
          })}
        </Text>
      </View>
      <TextField label={t('Adresse')} value={address} onChangeText={setAddress} placeholder={t('Ex. 1234 rue Rachel Est, app. 2')} icon="home-outline" maxLength={200} />
      <TextField
        label={t('Code postal')}
        value={postal}
        onChangeText={(v) => setPostal(v.toUpperCase())}
        placeholder="H2J 1A1"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={7}
        icon="mail-outline"
      />
      <Button title={t('Trouver sur la carte')} variant="secondary" size="md" icon="search-outline" loading={searching} onPress={locate} />
      {point && (
        <PickupPicker
          key={mapKey}
          value={point}
          onChange={setPoint}
          onConfirmed={() => {}}
          hideArea
          autoLocate={gps}
        />
      )}
      {!point && (
        <Button
          title={t('Utiliser ma position actuelle')}
          variant="ghost"
          size="md"
          icon="navigate-outline"
          onPress={() => {
            setGps(true);
            setPoint({ latitude: config.defaultRegion.latitude, longitude: config.defaultRegion.longitude });
            setMapKey((k) => k + 1);
          }}
        />
      )}
      <Button title={t('Enregistrer mon adresse')} onPress={save} loading={saving} />
    </View>
  );
}

const styles = StyleSheet.create({
  privacy: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.sage, padding: spacing.md, borderRadius: radius.md },
});
