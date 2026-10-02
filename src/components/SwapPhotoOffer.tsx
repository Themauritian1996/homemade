/**
 * Offre d'échange faite d'une simple photo, sans publier le plat dans le fil.
 * L'IA propose (titre, ingrédients, allergènes), l'Eater vérifie et atteste, le serveur décide :
 * l'offre reste privée et n'est envoyée que si elle est compatible avec le profil santé du Cooker.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, TextInput, View } from 'react-native';
import { Button, Chip } from '@/components/ui';
import { ALLERGENS, allergenById, AllergenCode, CuisineCode, DietCode } from '@/data/allergens';
import { t, tr } from '@/i18n';
import { friendlyError } from '@/lib/errors';
import { declaredAllergens, DIET_FORBIDS } from '@/lib/mealValidation';
import { photoFreshness } from '@/lib/photoFreshness';
import { PickedPhoto, pickPhoto } from '@/lib/pickPhoto';
import { expandAllergens } from '@/lib/safety';
import { getMyAddress } from '@/services/address';
import { aiAvailable, analyzeMealPhoto, preparePhoto, uploadMealPhoto } from '@/services/ai';
import type { SwapPhotoOffer as Offer } from '@/services/orders';
import { useApp } from '@/store/app';
import { colors, createStyles, fonts, radius, spacing, type } from '@/theme';
import type { MealIngredient } from '@/types';

export function SwapPhotoOffer({ onChange }: { onChange: (offer: Offer | null) => void }) {
  const user = useApp((s) => s.user);
  const location = useApp((s) => s.location);
  const [picked, setPicked] = useState<PickedPhoto | null>(null);
  const [path, setPath] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [cuisine, setCuisine] = useState<CuisineCode>('other');
  const [diets, setDiets] = useState<DietCode[]>([]);
  const [ingredients, setIngredients] = useState<MealIngredient[]>([]);
  const [extra, setExtra] = useState<AllergenCode[]>([]);
  const [newIngredient, setNewIngredient] = useState('');
  const [attested, setAttested] = useState(false);
  const [pickup, setPickup] = useState(location);

  // Lieu de l'offre : l'adresse enregistrée si elle existe (jamais affichée : position brouillée par le serveur).
  useEffect(() => {
    getMyAddress()
      .then((a) => a?.latitude != null && a.longitude != null && setPickup({ latitude: a.latitude, longitude: a.longitude }))
      .catch(() => {});
  }, []);

  const allergens = declaredAllergens(ingredients, extra);
  const locked = expandAllergens(ingredients.flatMap((i) => i.allergens));
  const ready = Boolean(picked && path && !busy && title.trim().length >= 4 && ingredients.length > 0 && attested);

  useEffect(() => {
    onChange(
      ready
        ? {
            photoPaths: path ? [path] : [],
            title: title.trim(),
            description: '',
            cuisine,
            ingredients: ingredients.map(({ name, allergens: a, source }) => ({ name, allergens: a, source })),
            declaredAllergens: allergens,
            mayContain: [],
            diets: diets.filter((d) => !conflicts(d, allergens)),
            pickup,
            pickupArea: t('Quartier communiqué après confirmation'),
            cookerAttestation: attested,
            aiAnalysisId: analysisId ?? undefined,
            photoSource: picked?.source,
            photoTakenAt: picked?.takenAt ?? null,
          }
        : null,
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, title, cuisine, diets, ingredients, extra, attested, pickup, path, analysisId]);

  const reset = () => {
    setPicked(null);
    setPath(null);
    setAnalysisId(null);
    setTitle('');
    setIngredients([]);
    setExtra([]);
    setDiets([]);
    setAttested(false);
  };

  const pick = async (source: 'camera' | 'library') => {
    const p = await pickPhoto(source, [4, 3]);
    if (!p) return;
    reset();
    setPicked(p);
    setBusy(true);
    try {
      const prepared = await preparePhoto(p.uri);
      const uploaded = await uploadMealPhoto(prepared, user?.id ?? 'anon');
      setPath(uploaded ?? 'demo.jpg');
      if (!(await aiAvailable())) return;
      try {
        const out = await analyzeMealPhoto(prepared, uploaded);
        const a = out.analysis;
        if (a && !a.isFood) {
          Alert.alert(t('Hmm…'), t('Nous ne reconnaissons pas de plat sur cette photo. Essayez avec une photo plus nette, vue de dessus.'));
          reset();
          return;
        }
        if (a) {
          setAnalysisId(out.aiAnalysisId);
          setTitle(a.title);
          setCuisine(a.cuisine);
          setDiets(a.diets);
          setIngredients(a.ingredients.map((i) => ({ name: i.name, allergens: i.allergens, source: 'ai' as const })));
          // Allergènes vus par l'IA sans ingrédient rattaché : conservés (fail-closed).
          const fromIngredients = new Set(a.ingredients.flatMap((i) => i.allergens));
          setExtra(a.allergens.map((x) => x.code).filter((c) => !fromIngredients.has(c)));
        }
      } catch {
        // L'IA n'est jamais bloquante : saisie manuelle.
      }
    } catch (e) {
      Alert.alert(t('Photo non enregistrée'), friendlyError(e, t('Vérifiez votre connexion et réessayez.')));
      reset();
    } finally {
      setBusy(false);
    }
  };

  const toggleAllergen = (code: AllergenCode) => {
    if (locked.has(code)) {
      const source = ingredients.find((i) => expandAllergens(i.allergens).has(code));
      Alert.alert(t('Allergène lié à un ingrédient'), t('« {0} » provient de « {1} ». Modifiez ou retirez l\'ingrédient pour le changer.', { 0: tr(allergenById(code)), 1: source?.name ?? '' }));
      return;
    }
    setExtra((x) => (x.includes(code) ? x.filter((c) => c !== code) : [...x, code]));
  };

  const addIngredient = () => {
    const name = newIngredient.trim();
    if (!name) return;
    setIngredients((l) => [...l, { name, allergens: [], source: 'cooker' }]);
    setNewIngredient('');
  };

  if (!picked) {
    return (
      <View style={{ gap: spacing.md }}>
        <Text style={type.body}>{t('Pas besoin de publier : prenez votre plat en photo, il ne sera visible que par ce Cooker.')}</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <Button title={t('Photo')} icon="camera" size="md" style={{ flex: 1 }} onPress={() => pick('camera')} />
          <Button title={t('Galerie')} icon="images-outline" size="md" variant="secondary" style={{ flex: 1 }} onPress={() => pick('library')} />
        </View>
      </View>
    );
  }

  const fresh = photoFreshness({ photoSource: picked.source, photoTakenAt: picked.takenAt, createdAt: new Date().toISOString() });
  return (
    <View style={{ gap: spacing.lg }}>
      <View style={{ flexDirection: 'row', gap: spacing.md, alignItems: 'center' }}>
        <Image source={{ uri: picked.uri }} style={styles.photo} contentFit="cover" />
        <View style={{ flex: 1, gap: 4 }}>
          {busy ? (
            <View style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
              <ActivityIndicator color={colors.forest} />
              <Text style={type.caption}>{t('Analyse de la photo…')}</Text>
            </View>
          ) : (
            <Text style={type.caption}>{analysisId ? t('Pré-rempli par l\'IA — à vérifier') : t('Décrivez votre plat en quelques mots.')}</Text>
          )}
          {fresh && <Text style={[type.caption, { color: fresh.fresh ? colors.forest : colors.muted }]}>{fresh.label}</Text>}
          <Pressable onPress={() => reset()} accessibilityRole="button">
            <Text style={[type.caption, { color: colors.tomato, fontFamily: fonts.semibold }]}>{t('Changer de photo')}</Text>
          </Pressable>
        </View>
      </View>

      {!busy && (
        <>
          <TextInput value={title} onChangeText={setTitle} placeholder={t('Nom du plat (ex. Chili végé maison)')} placeholderTextColor={colors.muted} style={styles.input} maxLength={80} />

          <View style={{ gap: spacing.sm }}>
            <Text style={type.bodyStrong}>{t('Ingrédients')}</Text>
            <View style={styles.wrap}>
              {ingredients.map((i, idx) => (
                <Chip key={`${i.name}-${idx}`} label={`${i.name}  ✕`} onPress={() => setIngredients((l) => l.filter((_, k) => k !== idx))} />
              ))}
            </View>
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <TextInput
                value={newIngredient}
                onChangeText={setNewIngredient}
                onSubmitEditing={addIngredient}
                placeholder={t('Ajouter un ingrédient')}
                placeholderTextColor={colors.muted}
                style={[styles.input, { flex: 1 }]}
                returnKeyType="done"
              />
              <Pressable style={styles.add} onPress={addIngredient} accessibilityRole="button" accessibilityLabel={t('Ajouter')}>
                <Ionicons name="add" size={22} color={colors.onDark} />
              </Pressable>
            </View>
          </View>

          <View style={{ gap: spacing.sm }}>
            <Text style={type.bodyStrong}>{t('Allergènes présents')}</Text>
            <View style={styles.wrap}>
              {ALLERGENS.map((a) => (
                <Chip key={a.id} label={tr(a)} emoji={a.emoji} tone="danger" selected={allergens.includes(a.id)} onPress={() => toggleAllergen(a.id)} />
              ))}
            </View>
          </View>

          <Pressable style={styles.attest} onPress={() => setAttested((v) => !v)} accessibilityRole="checkbox" accessibilityState={{ checked: attested }}>
            <Ionicons name={attested ? 'checkbox' : 'square-outline'} size={22} color={attested ? colors.forest : colors.muted} />
            <Text style={[type.caption, { flex: 1, color: colors.ink }]}>{t('J’ai vérifié les ingrédients et les allergènes de mon plat.')}</Text>
          </Pressable>
          <View style={styles.info}>
            <Ionicons name="shield-checkmark" size={16} color={colors.forest} />
            <Text style={[type.caption, { flex: 1, color: colors.forest }]}>
              {t('Homemade vérifie que votre plat convient au profil santé du Cooker avant d’envoyer l’offre (sans vous révéler ce profil).')}
            </Text>
          </View>
        </>
      )}
    </View>
  );
}

/** Un régime suggéré par l'IA incompatible avec les allergènes retenus est retiré (le serveur le refuserait). */
const conflicts = (d: DietCode, allergens: AllergenCode[]) => (DIET_FORBIDS[d] ?? []).some((a) => allergens.includes(a));

const styles = createStyles(() => ({
  photo: { width: 96, height: 72, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  input: { minHeight: 44, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: spacing.md, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, borderWidth: 1, borderColor: colors.border },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  add: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  attest: { flexDirection: 'row', gap: spacing.sm, alignItems: 'center' },
  info: { flexDirection: 'row', gap: spacing.sm, backgroundColor: colors.sage, padding: spacing.md, borderRadius: radius.md },
}));
