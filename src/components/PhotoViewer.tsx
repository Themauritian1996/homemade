/**
 * Photos en plein écran : pincer pour zoomer (jusqu'à ×5), glisser pour se déplacer, toucher deux fois pour
 * zoomer/dézoomer, balayer pour passer à la photo suivante. Sans Reanimated : les gestes (react-native-gesture-handler)
 * pilotent des Animated.Value côté JS, largement suffisant pour une photo.
 */
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, FlatList, Modal, Pressable, StatusBar, Text, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { t } from '@/i18n';

const MAX_SCALE = 5;

function ZoomableImage({ uri, width, height, onZoomChange }: { uri: string; width: number; height: number; onZoomChange: (zoomed: boolean) => void }) {
  const scale = useRef(new Animated.Value(1)).current;
  const tx = useRef(new Animated.Value(0)).current;
  const ty = useRef(new Animated.Value(0)).current;
  const base = useRef({ scale: 1, x: 0, y: 0 });
  const [zoomed, setZoomed] = useState(false);

  const setZoom = (z: boolean) => {
    setZoomed(z);
    onZoomChange(z);
  };
  const clampPan = (x: number, y: number, s: number) => {
    const maxX = (width * (s - 1)) / 2;
    const maxY = (height * (s - 1)) / 2;
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const reset = () => {
    base.current = { scale: 1, x: 0, y: 0 };
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, useNativeDriver: true }),
      Animated.spring(tx, { toValue: 0, useNativeDriver: true }),
      Animated.spring(ty, { toValue: 0, useNativeDriver: true }),
    ]).start();
    setZoom(false);
  };

  const gesture = useMemo(() => {
    const pinch = Gesture.Pinch()
      .runOnJS(true)
      .onUpdate((e) => scale.setValue(Math.max(0.8, Math.min(MAX_SCALE, base.current.scale * e.scale))))
      .onEnd((e) => {
        const s = Math.max(1, Math.min(MAX_SCALE, base.current.scale * e.scale));
        if (s <= 1.05) return reset();
        base.current.scale = s;
        const c = clampPan(base.current.x, base.current.y, s);
        base.current.x = c.x;
        base.current.y = c.y;
        Animated.spring(scale, { toValue: s, useNativeDriver: true }).start();
        tx.setValue(c.x);
        ty.setValue(c.y);
        setZoom(true);
      });
    const pan = Gesture.Pan()
      .runOnJS(true)
      .enabled(zoomed)
      .averageTouches(true)
      .onUpdate((e) => {
        const c = clampPan(base.current.x + e.translationX, base.current.y + e.translationY, base.current.scale);
        tx.setValue(c.x);
        ty.setValue(c.y);
      })
      .onEnd((e) => {
        const c = clampPan(base.current.x + e.translationX, base.current.y + e.translationY, base.current.scale);
        base.current.x = c.x;
        base.current.y = c.y;
      });
    const doubleTap = Gesture.Tap()
      .runOnJS(true)
      .numberOfTaps(2)
      .onEnd(() => {
        if (base.current.scale > 1) return reset();
        base.current = { scale: 2.5, x: 0, y: 0 };
        Animated.spring(scale, { toValue: 2.5, useNativeDriver: true }).start();
        setZoom(true);
      });
    return Gesture.Exclusive(doubleTap, Gesture.Simultaneous(pinch, pan));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoomed, width, height]);

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={{ width, height, transform: [{ translateX: tx }, { translateY: ty }, { scale }] }}>
        <Image source={{ uri }} style={{ width, height }} contentFit="contain" transition={150} accessibilityIgnoresInvertColors />
      </Animated.View>
    </GestureDetector>
  );
}

export function PhotoViewer({ photos, index, onClose }: { photos: string[]; index: number | null; onClose: () => void }) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [current, setCurrent] = useState(index ?? 0);
  const [zoomed, setZoomed] = useState(false);
  const visible = index !== null && photos.length > 0;
  useEffect(() => {
    if (index !== null) {
      setCurrent(index);
      setZoomed(false);
    }
  }, [index]);

  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000' }}>
        <StatusBar barStyle="light-content" />
        {visible && (
          <FlatList
            data={photos}
            horizontal
            pagingEnabled
            scrollEnabled={!zoomed}
            initialScrollIndex={index ?? 0}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            keyExtractor={(u, i) => `${u}-${i}`}
            showsHorizontalScrollIndicator={false}
            onMomentumScrollEnd={(e) => setCurrent(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => <ZoomableImage uri={item} width={width} height={height} onZoomChange={setZoomed} />}
          />
        )}
        <View style={{ position: 'absolute', top: insets.top + 8, left: 16, right: 16, flexDirection: 'row', alignItems: 'center' }} pointerEvents="box-none">
          <Text style={{ color: '#fff', fontSize: 15, flex: 1 }}>{photos.length > 1 ? `${current + 1} / ${photos.length}` : ''}</Text>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('Fermer')}
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="close" size={24} color="#fff" />
          </Pressable>
        </View>
        <Text style={{ position: 'absolute', bottom: insets.bottom + 16, alignSelf: 'center', color: 'rgba(255,255,255,0.7)', fontSize: 13 }}>
          {t('Pincez ou touchez deux fois pour zoomer')}
        </Text>
      </GestureHandlerRootView>
    </Modal>
  );
}
