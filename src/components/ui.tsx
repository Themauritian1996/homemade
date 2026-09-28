/** Primitives UI Homemade. Toujours composer les écrans à partir de ces briques. */
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { Image } from 'expo-image';
import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
  ViewStyle,
} from 'react-native';
import { colors, fonts, radius, spacing, type } from '@/theme';
import { formatRating } from '@/lib/format';

type IconName = React.ComponentProps<typeof Ionicons>['name'];

// ───────────────────────────── Button
type ButtonVariant = 'primary' | 'accent' | 'secondary' | 'ghost' | 'danger';

export function Button({
  title,
  onPress,
  variant = 'primary',
  icon,
  loading,
  disabled,
  style,
  size = 'lg',
}: {
  title: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  style?: StyleProp<ViewStyle>;
  size?: 'md' | 'lg';
}) {
  const palette: Record<ButtonVariant, { bg: string; fg: string; border?: string }> = {
    primary: { bg: colors.forest, fg: colors.onDark },
    accent: { bg: colors.tomato, fg: colors.onDark },
    secondary: { bg: colors.surface, fg: colors.ink, border: colors.border },
    ghost: { bg: 'transparent', fg: colors.forest },
    danger: { bg: colors.dangerSoft, fg: colors.danger },
  };
  const p = palette[variant];
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: isDisabled }}
      disabled={isDisabled}
      onPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.btn,
        size === 'md' && styles.btnMd,
        { backgroundColor: p.bg, borderColor: p.border ?? p.bg, opacity: isDisabled ? 0.5 : pressed ? 0.85 : 1 },
        pressed && { transform: [{ scale: 0.985 }] },
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={p.fg} />
      ) : (
        <>
          {icon && <Ionicons name={icon} size={size === 'md' ? 16 : 18} color={p.fg} />}
          <Text style={[styles.btnText, size === 'md' && { fontSize: 14 }, { color: p.fg }]}>{title}</Text>
        </>
      )}
    </Pressable>
  );
}

// ───────────────────────────── Chip
export function Chip({
  label,
  selected,
  onPress,
  icon,
  emoji,
  tone = 'forest',
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
  emoji?: string;
  tone?: 'forest' | 'danger';
}) {
  const activeBg = tone === 'danger' ? colors.danger : colors.forest;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={() => {
        Haptics.selectionAsync().catch(() => {});
        onPress?.();
      }}
      style={[styles.chip, selected && { backgroundColor: activeBg, borderColor: activeBg }]}
    >
      {emoji && <Text style={{ fontSize: 14 }}>{emoji}</Text>}
      {icon && <Ionicons name={icon} size={14} color={selected ? colors.onDark : colors.inkSoft} />}
      <Text style={[styles.chipText, selected && { color: colors.onDark }]}>{label}</Text>
    </Pressable>
  );
}

// ───────────────────────────── Avatar
export function Avatar({ uri, name, size = 40, verified }: { uri?: string; name: string; size?: number; verified?: boolean }) {
  return (
    <View style={{ width: size, height: size }}>
      {uri ? (
        <Image source={{ uri }} style={{ width: size, height: size, borderRadius: size / 2 }} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.avatarFallback, { width: size, height: size, borderRadius: size / 2 }]}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.forest, fontSize: size * 0.4 }}>{name.slice(0, 1).toUpperCase()}</Text>
        </View>
      )}
      {verified && (
        <View style={[styles.verified, { right: -2, bottom: -2 }]}>
          <Ionicons name="checkmark" size={Math.max(9, size * 0.22)} color={colors.onDark} />
        </View>
      )}
    </View>
  );
}

// ───────────────────────────── Rating
export function RatingPill({ rating, count, compact }: { rating: number | null; count: number; compact?: boolean }) {
  const isNew = rating == null;
  return (
    <View style={[styles.rating, isNew && { backgroundColor: colors.sage }]}>
      <Ionicons name={isNew ? 'sparkles' : 'star'} size={12} color={isNew ? colors.forest : colors.saffron} />
      <Text style={styles.ratingText}>
        {formatRating(rating)}
        {!isNew && !compact && <Text style={{ color: colors.muted, fontFamily: fonts.regular }}> ({count})</Text>}
      </Text>
    </View>
  );
}

export function Stars({ value, size = 16, onChange }: { value: number; size?: number; onChange?: (v: number) => void }) {
  return (
    <View style={{ flexDirection: 'row', gap: 4 }}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Pressable key={i} disabled={!onChange} onPress={() => onChange?.(i)} hitSlop={6}>
          <Ionicons name={i <= Math.round(value) ? 'star' : 'star-outline'} size={size} color={colors.saffron} />
        </Pressable>
      ))}
    </View>
  );
}

// ───────────────────────────── Badge
export function Badge({ label, tone = 'neutral', icon }: { label: string; tone?: 'neutral' | 'forest' | 'tomato' | 'saffron' | 'danger'; icon?: IconName }) {
  const map = {
    neutral: [colors.surfaceAlt, colors.inkSoft],
    forest: [colors.sage, colors.forest],
    tomato: [colors.tomatoSoft, colors.tomato],
    saffron: [colors.saffronSoft, colors.warning],
    danger: [colors.dangerSoft, colors.danger],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      {icon && <Ionicons name={icon} size={11} color={fg} />}
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

// ───────────────────────────── TextField
export function TextField({ label, error, icon, style, ...props }: TextInputProps & { label?: string; error?: string; icon?: IconName }) {
  return (
    <View style={{ gap: spacing.xs }}>
      {label && <Text style={type.label}>{label}</Text>}
      <View style={[styles.field, !!error && { borderColor: colors.danger }]}>
        {icon && <Ionicons name={icon} size={18} color={colors.muted} />}
        <TextInput placeholderTextColor={colors.muted} style={[styles.fieldInput, style]} {...props} />
      </View>
      {!!error && <Text style={[type.caption, { color: colors.danger }]}>{error}</Text>}
    </View>
  );
}

// ───────────────────────────── Misc
export function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <View style={styles.sectionHeader}>
      <Text style={type.h2}>{title}</Text>
      {action && (
        <Pressable onPress={onAction} hitSlop={8}>
          <Text style={{ fontFamily: fonts.semibold, color: colors.forest, fontSize: 14 }}>{action}</Text>
        </Pressable>
      )}
    </View>
  );
}

export function EmptyState({ icon, title, body, children }: { icon: IconName; title: string; body: string; children?: React.ReactNode }) {
  return (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Ionicons name={icon} size={28} color={colors.forest} />
      </View>
      <Text style={[type.h3, { textAlign: 'center' }]}>{title}</Text>
      <Text style={[type.body, { textAlign: 'center' }]}>{body}</Text>
      {children}
    </View>
  );
}

export function IconButton({ icon, onPress, style, badge, ...rest }: { icon: IconName; onPress?: () => void; style?: StyleProp<ViewStyle>; badge?: number } & Omit<PressableProps, 'style'>) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.iconBtn, pressed && { opacity: 0.7 }, style]} hitSlop={6} {...rest}>
      <Ionicons name={icon} size={20} color={colors.ink} />
      {!!badge && (
        <View style={styles.iconBadge}>
          <Text style={styles.iconBadgeText}>{badge}</Text>
        </View>
      )}
    </Pressable>
  );
}

export function Divider({ style }: { style?: StyleProp<ViewStyle> }) {
  return <View style={[{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }, style]} />;
}

const styles = StyleSheet.create({
  btn: {
    height: 54,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.xl,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    borderWidth: 1,
  },
  btnMd: { height: 42, borderRadius: radius.md, paddingHorizontal: spacing.lg },
  btnText: { fontFamily: fonts.semibold, fontSize: 16 },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipText: { fontFamily: fonts.medium, fontSize: 14, color: colors.inkSoft },
  avatarFallback: { backgroundColor: colors.sage, alignItems: 'center', justifyContent: 'center' },
  verified: {
    position: 'absolute',
    backgroundColor: colors.forest,
    borderRadius: 99,
    padding: 2,
    borderWidth: 2,
    borderColor: colors.surface,
  },
  rating: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: colors.saffronSoft,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  ratingText: { fontFamily: fonts.semibold, fontSize: 12, color: colors.ink },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { fontFamily: fonts.semibold, fontSize: 11 },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    minHeight: 50,
  },
  fieldInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15, color: colors.ink, paddingVertical: spacing.sm },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  empty: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.huge, paddingHorizontal: spacing.xxl },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.sage,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconBadge: {
    position: 'absolute',
    top: -3,
    right: -3,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.tomato,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  iconBadgeText: { color: colors.onDark, fontFamily: fonts.bold, fontSize: 10 },
});
