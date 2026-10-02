/**
 * Photo depuis l'appareil photo ou la galerie (permissions demandées au besoin), avec son origine :
 * appareil photo = prise maintenant ; galerie = date de prise de vue lue dans la photo (EXIF) si elle existe.
 */
import * as ImagePicker from 'expo-image-picker';
import { Alert } from 'react-native';
import { t } from '@/i18n';
import { exifDate } from './photoFreshness';

export interface PickedPhoto {
  uri: string;
  source: 'camera' | 'library';
  /** Date de prise de vue (ISO) ; null si inconnue. */
  takenAt: string | null;
}

export async function pickPhoto(source: 'camera' | 'library', aspect?: [number, number]): Promise<PickedPhoto | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      t('Permission requise'),
      source === 'camera' ? t('Autorisez l’appareil photo dans les réglages du téléphone.') : t('Autorisez l’accès aux photos dans les réglages du téléphone.'),
    );
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: Boolean(aspect), aspect, exif: true };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const asset = res.canceled ? null : res.assets[0];
  if (!asset) return null;
  return { uri: asset.uri, source, takenAt: source === 'camera' ? new Date().toISOString() : exifDate(asset.exif) };
}
