/**
 * Publication assistée par IA — étapes : capture → analyse → révision humaine → publication.
 * Principe non négociable : l'IA PROPOSE, le Cooker VALIDE. Rien n'est publié sans attestation.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { router } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AllergenPicker } from '@/components/AllergenPicker';
import { PickupPicker } from '@/components/PickupPicker';
import { Badge, Button, Chip, TextField } from '@/components/ui';
import { ALLERGENS, AllergenCode, CUISINES, CuisineCode, DIETS, DietCode, allergenById } from '@/data/allergens';
import { config } from '@/lib/config';
import { friendlyError } from '@/lib/errors';
import { declaredAllergens, validateMealDraft } from '@/lib/mealValidation';
import { expandAllergens } from '@/lib/safety';
import { ingredientsFromScan, mergeScan } from '@/lib/scanMerge';
import { useAiAvailable } from '@/lib/useAiAvailable';
import { aiAvailable, analyzeMealPhoto, preparePhoto, PreparedPhoto, scanText, uploadMealPhoto } from '@/services/ai';
import { publishMeal } from '@/services/meals';
import { useApp } from '@/store/app';
import { colors, fonts, radius, shadow, spacing, type } from '@/theme';
import type { AiMealAnalysis, AiTextScan, GeoPoint, MealIngredient, MealMode } from '@/types';

/** Sans clé Stripe, la vente est impossible côté serveur : la bêta se fait en mode échange. */
const SALES_ENABLED = Boolean(config.stripePublishableKey);

/** Photo depuis l'appareil photo ou la galerie (permissions demandées au besoin). */
async function pickImage(source: 'camera' | 'library', aspect?: [number, number]): Promise<string | null> {
  const perm = source === 'camera' ? await ImagePicker.requestCameraPermissionsAsync() : await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (!perm.granted) {
    Alert.alert(
      'Permission requise',
      source === 'camera' ? 'Autorisez l’appareil photo dans les réglages du téléphone.' : 'Autorisez l’accès aux photos dans les réglages du téléphone.',
    );
    return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9, allowsEditing: Boolean(aspect), aspect };
  const res = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  return res.canceled || !res.assets[0] ? null : res.assets[0].uri;
}

type Step = 'capture' | 'analyzing' | 'review' | 'done';

/** En-dessous de ce seuil, une suggestion IA est marquée « à vérifier ». */
const LOW_CONFIDENCE = 0.6;

export default function Publish() {
  const [step, setStep] = useState<Step>('capture');
  const [photo, setPhoto] = useState<PreparedPhoto | null>(null);
  const [analysis, setAnalysis] = useState<AiMealAnalysis | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [analysisId, setAnalysisId] = useState<string | null>(null);
  const user = useApp((s) => s.user);

  const pick = async (source: 'camera' | 'library') => {
    const uri = await pickImage(source, [4, 3]);
    if (!uri) return;
    let prepared: PreparedPhoto;
    let path: string | null = null;
    try {
      prepared = await preparePhoto(uri);
      setPhoto(prepared);
      setStep('analyzing');
      // La photo est enregistrée avant (et indépendamment de) l'IA : elle n'est jamais perdue.
      path = await uploadMealPhoto(prepared, user?.id ?? 'anon');
      setPhotoPath(path);
    } catch (e) {
      Alert.alert('Photo non enregistrée', friendlyError(e, 'Vérifiez votre connexion et réessayez.'));
      setStep('capture');
      return;
    }
    if (!(await aiAvailable())) {
      setAnalysis(null);
      setStep('review');
      return;
    }
    try {
      const out = await analyzeMealPhoto(prepared, path);
      if (out.analysis && !out.analysis.isFood) {
        Alert.alert('Hmm…', 'Nous ne reconnaissons pas de plat sur cette photo. Essayez avec une photo plus nette, vue de dessus.');
        setStep('capture');
        return;
      }
      setAnalysis(out.analysis);
      setAnalysisId(out.aiAnalysisId);
      setStep('review');
    } catch {
      // L'IA est une aide, jamais un point de blocage : on bascule en saisie manuelle.
      Alert.alert('Analyse indisponible', 'Vous pouvez remplir l’annonce manuellement.');
      setAnalysis(null);
      setStep('review');
    }
  };

  const reset = () => {
    setStep('capture');
    setPhoto(null);
    setAnalysis(null);
    setPhotoPath(null);
    setAnalysisId(null);
  };

  if (step === 'capture') return <CaptureStep onPick={pick} />;
  if (step === 'analyzing') return <AnalyzingStep uri={photo?.uri} />;
  if (step === 'done') return <DoneStep onAgain={reset} />;
  return <ReviewStep photo={photo} analysis={analysis} photoPath={photoPath} analysisId={analysisId} onCancel={reset} onPublished={() => setStep('done')} />;
}

// ───────────────────────────────────────── Capture
function CaptureStep({ onPick }: { onPick: (s: 'camera' | 'library') => void }) {
  const insets = useSafeAreaInsets();
  const ai = useAiAvailable();
  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.bg }} contentContainerStyle={{ paddingTop: insets.top + spacing.xl, padding: spacing.xl, gap: spacing.xl }}>
      <View style={{ gap: spacing.sm }}>
        <Text style={type.label}>Espace Cooker</Text>
        <Text style={type.h1}>Partagez votre plat</Text>
        <Text style={type.body}>
          {ai !== false
            ? "Prenez une photo : notre IA prépare l'annonce pour vous — type de plat, ingrédients et allergènes. Vous vérifiez, vous publiez."
            : 'Prenez une photo, décrivez les ingrédients et déclarez les allergènes. Vos voisins allergiques seront protégés automatiquement.'}
        </Text>
        <View style={{ flexDirection: 'row' }}>
          {ai === null ? (
            <Badge label="Vérification de l'IA…" icon="hourglass-outline" />
          ) : ai ? (
            <Badge label="IA active · photo + lecture d'étiquettes" tone="forest" icon="sparkles" />
          ) : (
            <Badge label="IA indisponible · saisie manuelle" tone="saffron" icon="create-outline" />
          )}
        </View>
      </View>

      <Pressable onPress={() => onPick('camera')} style={({ pressed }) => [styles.captureCard, pressed && { opacity: 0.92 }]}>
        <LinearGradient colors={[colors.forest, colors.forestSoft]} style={StyleSheet.absoluteFill} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} />
        <View style={styles.captureIcon}>
          <Ionicons name="camera" size={34} color={colors.forest} />
        </View>
        <Text style={[type.h2, { color: colors.onDark }]}>Photographier mon plat</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={14} color={colors.saffron} />
          <Text style={{ fontFamily: fonts.medium, color: 'rgba(255,255,255,0.85)' }}>
            {ai !== false ? "Annonce pré-remplie par l'IA en quelques secondes" : 'Annonce prête en une minute'}
          </Text>
        </View>
      </Pressable>

      <Button title="Choisir dans la galerie" variant="secondary" icon="images-outline" onPress={() => onPick('library')} />

      <View style={styles.tips}>
        <Text style={type.bodyStrong}>Pour une analyse précise</Text>
        {['Lumière naturelle, vue de dessus ou à 45°', 'Un seul plat par photo, bien cadré', 'Sauces et garnitures visibles si possible'].map((t) => (
          <View key={t} style={{ flexDirection: 'row', gap: spacing.sm, alignItems: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text style={type.body}>{t}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

// ───────────────────────────────────────── Analyzing
function AnalyzingStep({ uri }: { uri?: string }) {
  const scan = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(0);
  const phases = ['Identification du plat…', 'Estimation des ingrédients…', 'Détection des allergènes…'];

  useEffect(() => {
    const loop = Animated.loop(Animated.timing(scan, { toValue: 1, duration: 1600, easing: Easing.inOut(Easing.quad), useNativeDriver: true }));
    loop.start();
    const t = setInterval(() => setPhase((p) => Math.min(p + 1, phases.length - 1)), 900);
    return () => {
      loop.stop();
      clearInterval(t);
    };
  }, [scan, phases.length]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.xxl }}>
      <View style={styles.scanFrame}>
        {uri && <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" />}
        <Animated.View
          style={[styles.scanLine, { transform: [{ translateY: scan.interpolate({ inputRange: [0, 1], outputRange: [0, 276] }) }] }]}
        />
      </View>
      <View style={{ alignItems: 'center', gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
          <Ionicons name="sparkles" size={18} color={colors.saffron} />
          <Text style={[type.h2, { color: colors.onDark }]}>Analyse en cours</Text>
        </View>
        <Text style={{ fontFamily: fonts.medium, color: 'rgba(255,255,255,0.7)', fontSize: 15 }}>{phases[phase]}</Text>
      </View>
    </View>
  );
}

// ───────────────────────────────────────── Review (validation humaine)
function ReviewStep({
  photo,
  analysis,
  photoPath,
  analysisId,
  onCancel,
  onPublished,
}: {
  photo: PreparedPhoto | null;
  analysis: AiMealAnalysis | null;
  photoPath: string | null;
  analysisId: string | null;
  onCancel: () => void;
  onPublished: () => void;
}) {
  const insets = useSafeAreaInsets();
  const location = useApp((s) => s.location);
  const hasRealLocation = useApp((s) => s.hasRealLocation);
  const userId = useApp((s) => s.user?.id ?? 'anon');
  const ai = useAiAvailable();

  const [title, setTitle] = useState(analysis?.title ?? '');
  const [description, setDescription] = useState(analysis?.description ?? '');
  const [cuisine, setCuisine] = useState<CuisineCode>(analysis?.cuisine ?? 'other');
  const [ingredients, setIngredients] = useState<(MealIngredient & { confidence?: number })[]>(
    analysis?.ingredients.map((i) => ({ name: i.name, allergens: i.allergens, source: 'ai' as const, confidence: i.confidence })) ?? [],
  );
  // Allergènes détectés par l'IA qui ne sont rattachés à aucun ingrédient : conservés par défaut (fail-closed).
  const [extra, setExtra] = useState<AllergenCode[]>(() => {
    const fromIngredients = new Set(analysis?.ingredients.flatMap((i) => i.allergens) ?? []);
    return (analysis?.allergens ?? []).map((a) => a.code).filter((c) => !fromIngredients.has(c));
  });
  const [mayContain, setMayContain] = useState<AllergenCode[]>([]);
  const [diets, setDiets] = useState<DietCode[]>(analysis?.diets ?? []);
  // Sans Stripe configuré, la vente est impossible côté serveur : on propose l'échange par défaut.
  const [mode, setMode] = useState<MealMode>(SALES_ENABLED ? 'sale' : 'swap');
  const [price, setPrice] = useState('12');
  const [portions, setPortions] = useState(3);
  const [hours, setHours] = useState(24);
  const [pickupArea, setPickupArea] = useState('');
  const [pickup, setPickup] = useState<GeoPoint>(location);
  const [pickupConfirmed, setPickupConfirmed] = useState(hasRealLocation);
  const [scanning, setScanning] = useState(false);
  const [scan, setScan] = useState<AiTextScan | null>(null);
  const [attested, setAttested] = useState(false);
  const [newIngredient, setNewIngredient] = useState('');
  const [editing, setEditing] = useState<number | null>(null);
  const [publishing, setPublishing] = useState(false);

  const allergens = declaredAllergens(ingredients, extra);
  const aiConfidence = new Map((analysis?.allergens ?? []).map((a) => [a.code, a.confidence]));
  const priceCents = mode === 'swap' ? null : Math.round(parseFloat(price.replace(',', '.') || '0') * 100);

  const toggleDeclared = (code: AllergenCode) => {
    // Inclut les implications (blé ⇒ gluten) : un allergène implicite se retire en modifiant l'ingrédient source.
    const source = ingredients.find((i) => expandAllergens(i.allergens).has(code));
    if (source) {
      Alert.alert('Allergène lié à un ingrédient', `« ${allergenById(code).fr} » provient de « ${source.name} ». Modifiez ou retirez l'ingrédient pour le changer.`);
      return;
    }
    setExtra((x) => (x.includes(code) ? x.filter((c) => c !== code) : [...x, code]));
  };

  const addIngredient = () => {
    const name = newIngredient.trim();
    if (!name) return;
    setIngredients((l) => [...l, { name, allergens: [], source: 'cooker' }]);
    setEditing(ingredients.length);
    setNewIngredient('');
  };

  const startScan = () =>
    Alert.alert(
      'Lire une étiquette ou une recette',
      "Photographiez la liste d'ingrédients d'un produit utilisé (sauce, bouillon, chocolat…) ou votre fiche recette. L'IA ajoute ingrédients et allergènes ; vous vérifiez.",
      [
        { text: 'Annuler', style: 'cancel' },
        { text: 'Galerie', onPress: () => runScan('library') },
        { text: 'Appareil photo', onPress: () => runScan('camera') },
      ],
    );

  const runScan = async (source: 'camera' | 'library') => {
    const uri = await pickImage(source);
    if (!uri) return;
    setScanning(true);
    try {
      setScan(await scanText(uri, userId));
    } catch (e) {
      Alert.alert('Lecture impossible', `${friendlyError(e, 'L’IA n’a pas pu lire cette photo.')}\n\nAjoutez les ingrédients à la main.`);
    } finally {
      setScanning(false);
    }
  };

  const applyScan = (s: AiTextScan) => {
    const merged = mergeScan({ ingredients, extra, mayContain }, s);
    setIngredients(merged.ingredients);
    setExtra(merged.extra);
    setMayContain(merged.mayContain);
    if (!title.trim() && s.source === 'recipe' && s.title) setTitle(s.title);
    setScan(null);
  };

  const submit = async () => {
    if (!pickupConfirmed) {
      return Alert.alert(
        'Lieu de cueillette',
        'Placez l’épingle sur votre lieu de cueillette (ou utilisez votre position actuelle) pour que vos voisins trouvent le plat.',
      );
    }
    const errors = validateMealDraft({ title, ingredients, allergens, diets, mode, priceCents, portions, attestation: attested });
    if (errors.length) return Alert.alert('À compléter', errors.join('\n\n'));
    setPublishing(true);
    try {
      await publishMeal({
        aiAnalysisId: analysisId ?? undefined,
        photoPaths: photoPath ? [photoPath] : [],
        title: title.trim(),
        description: description.trim(),
        cuisine,
        ingredients: ingredients.map(({ name, allergens: a, source }) => ({ name, allergens: a, source })),
        declaredAllergens: allergens,
        mayContain,
        diets,
        mode,
        priceCents,
        portions,
        availableHours: hours,
        pickup,
        pickupArea: pickupArea.trim() || 'Quartier communiqué après confirmation',
        cookerAttestation: attested,
      });
      onPublished();
    } catch (e) {
      Alert.alert('Publication impossible', friendlyError(e));
    } finally {
      setPublishing(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={{ paddingBottom: 140 }} keyboardShouldPersistTaps="handled">
        <View>
          {photo ? <Image source={{ uri: photo.uri }} style={styles.reviewPhoto} contentFit="cover" /> : <View style={[styles.reviewPhoto, { backgroundColor: colors.surfaceAlt }]} />}
          <LinearGradient colors={['rgba(0,0,0,0.4)', 'transparent']} style={[StyleSheet.absoluteFill, { height: 120 }]} />
          <Pressable onPress={onCancel} style={[styles.closeBtn, { top: insets.top + spacing.sm }]} accessibilityLabel="Annuler">
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>

        <View style={{ padding: spacing.xl, gap: spacing.xxl }}>
          {analysis ? (
            <View style={styles.aiBanner}>
              <Ionicons name="sparkles" size={18} color={colors.warning} />
              <View style={{ flex: 1 }}>
                <Text style={type.bodyStrong}>Pré-rempli par l'IA — à vérifier</Text>
                <Text style={type.caption}>
                  Les éléments marqués « à vérifier » ont une faible confiance. Vous restez responsable de l'exactitude de la déclaration.
                </Text>
                {analysis.warnings.map((w) => (
                  <Text key={w} style={[type.caption, { color: colors.warning, marginTop: 4 }]}>
                    ⚠︎ {w}
                  </Text>
                ))}
              </View>
            </View>
          ) : (
            <View style={styles.aiBanner}>
              <Ionicons name="create-outline" size={18} color={colors.warning} />
              <Text style={[type.body, { flex: 1 }]}>Saisie manuelle : décrivez votre plat et déclarez ses allergènes.</Text>
            </View>
          )}

          <View style={{ gap: spacing.lg }}>
            <TextField label="Titre" value={title} onChangeText={setTitle} placeholder="Ex. Lasagne végétarienne maison" maxLength={80} />
            <TextField label="Description" value={description} onChangeText={setDescription} placeholder="Ce qui rend votre plat unique…" multiline maxLength={500} style={{ minHeight: 80, textAlignVertical: 'top' }} />
          </View>

          <Section title="Type de cuisine">
            <View style={styles.wrap}>
              {CUISINES.map((c) => (
                <Chip key={c.id} emoji={c.emoji} label={c.fr} selected={cuisine === c.id} onPress={() => setCuisine(c.id)} />
              ))}
            </View>
          </Section>

          <Section title={`Ingrédients · ${ingredients.length}`} hint="Touchez un ingrédient pour ajuster ses allergènes.">
            <View style={{ gap: spacing.sm }}>
              {ingredients.map((ing, idx) => (
                <View key={`${ing.name}-${idx}`} style={styles.ingredient}>
                  <Pressable style={styles.ingredientRow} onPress={() => setEditing(editing === idx ? null : idx)}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' }}>
                        <Text style={type.bodyStrong}>{ing.name}</Text>
                        {ing.source === 'ai' && ing.confidence != null && ing.confidence < LOW_CONFIDENCE && <Badge label="à vérifier" tone="saffron" />}
                      </View>
                      <Text style={type.caption}>{ing.allergens.length ? ing.allergens.map((a) => `${allergenById(a).emoji} ${allergenById(a).fr}`).join('  ') : 'Aucun allergène'}</Text>
                    </View>
                    <Pressable hitSlop={8} onPress={() => setIngredients((l) => l.filter((_, i) => i !== idx))} accessibilityLabel={`Retirer ${ing.name}`}>
                      <Ionicons name="trash-outline" size={18} color={colors.muted} />
                    </Pressable>
                  </Pressable>
                  {editing === idx && (
                    <View style={{ paddingTop: spacing.md }}>
                      <AllergenPicker
                        selected={ing.allergens}
                        onToggle={(code) =>
                          setIngredients((l) =>
                            l.map((x, i) => (i === idx ? { ...x, source: 'cooker', allergens: x.allergens.includes(code) ? x.allergens.filter((c) => c !== code) : [...x.allergens, code] } : x)),
                          )
                        }
                      />
                    </View>
                  )}
                </View>
              ))}
              <View style={styles.addRow}>
                <TextInput
                  value={newIngredient}
                  onChangeText={setNewIngredient}
                  placeholder="Ajouter un ingrédient"
                  placeholderTextColor={colors.muted}
                  style={styles.addInput}
                  onSubmitEditing={addIngredient}
                  returnKeyType="done"
                />
                <Pressable onPress={addIngredient} style={styles.addBtn} accessibilityLabel="Ajouter">
                  <Ionicons name="add" size={20} color={colors.onDark} />
                </Pressable>
              </View>
              {ai && (
                <Pressable
                  onPress={startScan}
                  disabled={scanning}
                  style={({ pressed }) => [styles.scanBtn, pressed && { opacity: 0.85 }]}
                  accessibilityRole="button"
                >
                  {scanning ? <ActivityIndicator color={colors.forest} /> : <Ionicons name="scan-outline" size={20} color={colors.forest} />}
                  <View style={{ flex: 1 }}>
                    <Text style={[type.bodyStrong, { color: colors.forest }]}>{scanning ? 'Lecture en cours…' : 'Scanner une étiquette ou une recette'}</Text>
                    <Text style={type.caption}>L'IA lit la liste d'ingrédients et les mentions « Contient » / « Peut contenir ».</Text>
                  </View>
                </Pressable>
              )}
            </View>
          </Section>

          <Section title="Allergènes déclarés" hint="Calculés à partir des ingrédients. Le point jaune = suggéré par l'IA.">
            <AllergenPicker selected={allergens} onToggle={toggleDeclared} highlight={[...aiConfidence.keys()]} />
            {[...aiConfidence.entries()]
              .filter(([code, conf]) => conf < LOW_CONFIDENCE && allergens.includes(code))
              .map(([code]) => (
                <Text key={code} style={[type.caption, { color: colors.warning }]}>
                  ⚠︎ {allergenById(code).fr} : suggestion à faible confiance, conservée par précaution. Retirez-la seulement si vous êtes certain.
                </Text>
              ))}
          </Section>

          <Section title="Peut contenir des traces de" hint="Contamination croisée possible dans votre cuisine (ex. vous cuisinez souvent avec des noix).">
            <View style={styles.wrap}>
              {ALLERGENS.filter((a) => !allergens.includes(a.id)).map((a) => (
                <Chip
                  key={a.id}
                  emoji={a.emoji}
                  label={a.fr}
                  selected={mayContain.includes(a.id)}
                  onPress={() => setMayContain((m) => (m.includes(a.id) ? m.filter((x) => x !== a.id) : [...m, a.id]))}
                />
              ))}
            </View>
          </Section>

          <Section title="Régimes">
            <View style={styles.wrap}>
              {DIETS.map((d) => (
                <Chip key={d.id} label={d.fr} selected={diets.includes(d.id)} onPress={() => setDiets((l) => (l.includes(d.id) ? l.filter((x) => x !== d.id) : [...l, d.id]))} />
              ))}
            </View>
          </Section>

          <Section title="Mode">
            <View style={styles.wrap}>
              {(
                [
                  ['sale', 'Vente', 'cash-outline'],
                  ['swap', 'Échange', 'swap-horizontal'],
                  ['both', 'Les deux', 'git-compare-outline'],
                ] as const
              )
                .filter(([id]) => SALES_ENABLED || id === 'swap')
                .map(([id, label, icon]) => (
                  <Chip key={id} icon={icon} label={label} selected={mode === id} onPress={() => setMode(id)} />
                ))}
            </View>
            {!SALES_ENABLED && <Text style={type.caption}>Pendant la bêta, les plats s'échangent entre voisins. La vente sera activée ensuite.</Text>}
            {mode !== 'swap' && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
                <View style={{ flex: 1 }}>
                  <TextField label="Prix par portion ($ CA)" value={price} onChangeText={setPrice} keyboardType="decimal-pad" icon="pricetag-outline" />
                </View>
              </View>
            )}
          </Section>

          <Section title="Disponibilité">
            <Stepper label="Portions" value={portions} onChange={setPortions} min={1} max={20} />
            <Stepper label="Disponible pendant" value={hours} onChange={setHours} min={2} max={72} step={2} suffix=" h" />
          </Section>

          <Section title="Lieu de cueillette">
            <PickupPicker value={pickup} onChange={setPickup} area={pickupArea} onAreaChange={setPickupArea} onConfirmed={() => setPickupConfirmed(true)} />
          </Section>

          <Pressable onPress={() => setAttested(!attested)} style={[styles.attest, attested && { borderColor: colors.forest, backgroundColor: colors.sage }]}>
            <Ionicons name={attested ? 'checkbox' : 'square-outline'} size={24} color={attested ? colors.forest : colors.muted} />
            <Text style={[type.body, { flex: 1, color: colors.ink }]}>
              J'ai vérifié la liste des ingrédients et des allergènes. Elle est complète et exacte, et je respecte les règles d'hygiène Homemade.
            </Text>
          </Pressable>
        </View>
      </ScrollView>
      <ScanSheet
        scan={scan}
        onClose={() => setScan(null)}
        onApply={applyScan}
        onRetry={() => {
          setScan(null);
          startScan();
        }}
      />
      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button title="Publier le plat" variant="accent" icon="checkmark-circle" onPress={submit} loading={publishing} disabled={!attested} />
      </View>
    </KeyboardAvoidingView>
  );
}

// ───────────────────────────────────────── Résultat de lecture (OCR)
function ScanSheet({
  scan,
  onClose,
  onApply,
  onRetry,
}: {
  scan: AiTextScan | null;
  onClose: () => void;
  onApply: (s: AiTextScan) => void;
  onRetry: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [showText, setShowText] = useState(false);
  if (!scan) return null;
  const empty = scan.source === 'none' || (ingredientsFromScan(scan).length === 0 && scan.contains.length === 0 && scan.mayContain.length === 0);
  const toAdd = ingredientsFromScan(scan);
  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Fermer" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
        <ScrollView contentContainerStyle={{ gap: spacing.lg }}>
          <View style={{ gap: 4 }}>
            <Text style={type.label}>{scan.source === 'label' ? 'Étiquette lue' : scan.source === 'recipe' ? 'Recette lue' : 'Texte lu'}</Text>
            <Text style={type.h2}>{empty ? 'Aucun texte exploitable' : scan.title || 'Voici ce que l’IA a lu'}</Text>
          </View>
          {empty ? (
            <Text style={type.body}>Photographiez la liste d'ingrédients de près, bien à plat et sans reflet.</Text>
          ) : (
            <>
              <View style={{ gap: spacing.sm }}>
                <Text style={type.h3}>{scan.source === 'label' ? 'Ingrédient ajouté' : `Ingrédients ajoutés · ${toAdd.length}`}</Text>
                {toAdd.map((i) => (
                  <Text key={i.name} style={type.body}>
                    • {i.name}
                    {i.allergens.length ? `  —  ${i.allergens.map((a) => allergenById(a).fr).join(', ')}` : ''}
                  </Text>
                ))}
              </View>
              {scan.contains.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  <Text style={type.h3}>Contient</Text>
                  <View style={styles.wrap}>
                    {scan.contains.map((a) => (
                      <Badge key={a} label={`${allergenById(a).emoji} ${allergenById(a).fr}`} tone="danger" />
                    ))}
                  </View>
                </View>
              )}
              {scan.mayContain.length > 0 && (
                <View style={{ gap: spacing.sm }}>
                  <Text style={type.h3}>Peut contenir (traces)</Text>
                  <View style={styles.wrap}>
                    {scan.mayContain.map((a) => (
                      <Badge key={a} label={`${allergenById(a).emoji} ${allergenById(a).fr}`} tone="saffron" />
                    ))}
                  </View>
                </View>
              )}
              {scan.warnings.map((w) => (
                <Text key={w} style={[type.caption, { color: colors.warning }]}>
                  ⚠︎ {w}
                </Text>
              ))}
              {!!scan.text && (
                <Pressable onPress={() => setShowText(!showText)} style={styles.transcript}>
                  <Text style={[type.caption, { color: colors.forest, fontFamily: fonts.semibold }]}>
                    {showText ? 'Masquer le texte lu' : 'Comparer avec le texte lu'}
                  </Text>
                  {showText && <Text style={[type.caption, { color: colors.inkSoft, marginTop: spacing.sm }]}>{scan.text}</Text>}
                </Pressable>
              )}
              <Text style={type.caption}>Les allergènes lus s'ajoutent à votre annonce ; rien n'est retiré. Vous pourrez tout revoir avant de publier.</Text>
            </>
          )}
        </ScrollView>
        <View style={{ gap: spacing.sm, marginTop: spacing.lg }}>
          {empty ? (
            <Button title="Réessayer" icon="scan-outline" onPress={onRetry} />
          ) : (
            <Button title="Ajouter à mon annonce" icon="add-circle-outline" onPress={() => onApply(scan)} />
          )}
          <Button title="Annuler" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: spacing.md }}>
      <View style={{ gap: 2 }}>
        <Text style={type.h3}>{title}</Text>
        {hint && <Text style={type.caption}>{hint}</Text>}
      </View>
      {children}
    </View>
  );
}

function Stepper({ label, value, onChange, min, max, step = 1, suffix = '' }: { label: string; value: number; onChange: (v: number) => void; min: number; max: number; step?: number; suffix?: string }) {
  return (
    <View style={styles.stepper}>
      <Text style={[type.bodyStrong, { flex: 1 }]}>{label}</Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.max(min, value - step))} accessibilityLabel="Diminuer">
        <Ionicons name="remove" size={18} color={colors.ink} />
      </Pressable>
      <Text style={[type.h3, { minWidth: 48, textAlign: 'center' }]}>
        {value}
        {suffix}
      </Text>
      <Pressable style={styles.stepBtn} onPress={() => onChange(Math.min(max, value + step))} accessibilityLabel="Augmenter">
        <Ionicons name="add" size={18} color={colors.ink} />
      </Pressable>
    </View>
  );
}

// ───────────────────────────────────────── Done
function DoneStep({ onAgain }: { onAgain: () => void }) {
  return (
    <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', padding: spacing.xxl, gap: spacing.lg }}>
      <View style={styles.doneIcon}>
        <Ionicons name="checkmark" size={44} color={colors.onDark} />
      </View>
      <Text style={[type.h1, { textAlign: 'center' }]}>Votre plat est en ligne !</Text>
      <Text style={[type.body, { textAlign: 'center' }]}>
        Il apparaît maintenant sur la carte et dans le fil des voisins compatibles avec ses allergènes. Les demandes arrivent dans l'onglet Messages.
      </Text>
      <View style={{ alignSelf: 'stretch', gap: spacing.md, marginTop: spacing.lg }}>
        <Button title="Voir mes plats" onPress={() => router.push('/my-meals')} />
        <Button title="Publier un autre plat" variant="secondary" onPress={onAgain} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  captureCard: { height: 240, borderRadius: radius.xl, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', gap: spacing.md, ...shadow.floating },
  captureIcon: { width: 76, height: 76, borderRadius: 38, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  tips: { backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing.lg, gap: spacing.md, borderWidth: 1, borderColor: colors.border },
  scanFrame: { width: 280, height: 280, borderRadius: radius.xl, overflow: 'hidden', borderWidth: 2, borderColor: colors.saffron },
  scanLine: { position: 'absolute', left: 0, right: 0, height: 3, backgroundColor: colors.saffron, shadowColor: colors.saffron, shadowOpacity: 1, shadowRadius: 12, elevation: 6 },
  reviewPhoto: { width: '100%', height: 260 },
  closeBtn: { position: 'absolute', left: spacing.lg, width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
  aiBanner: { flexDirection: 'row', gap: spacing.md, backgroundColor: colors.saffronSoft, padding: spacing.lg, borderRadius: radius.lg },
  wrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  ingredient: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  ingredientRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  addRow: { flexDirection: 'row', gap: spacing.sm },
  addInput: {
    flex: 1,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: 'dashed',
    paddingHorizontal: spacing.md,
    fontFamily: fonts.regular,
    fontSize: 15,
    color: colors.ink,
    backgroundColor: colors.surface,
  },
  addBtn: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.forest, alignItems: 'center', justifyContent: 'center' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, backgroundColor: colors.surface, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  stepBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.surfaceAlt, alignItems: 'center', justifyContent: 'center' },
  attest: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  scanBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.sage,
    minHeight: 56,
  },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: { maxHeight: '85%', backgroundColor: colors.bg, borderTopLeftRadius: radius.xl, borderTopRightRadius: radius.xl, padding: spacing.xl },
  transcript: { backgroundColor: colors.surface, borderRadius: radius.md, padding: spacing.md, borderWidth: 1, borderColor: colors.border },
  doneIcon: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: colors.forest,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
});
