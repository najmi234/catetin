import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { fontSize, radius, space, useTheme, type Palette } from '@/theme';

type Tone = 'default' | 'muted' | 'primary' | 'danger' | 'success' | 'warning' | 'onPrimary';
type Variant = 'hero' | 'title' | 'heading' | 'body' | 'small' | 'caption' | 'label';

const variants: Record<Variant, TextStyle> = {
  hero: { fontSize: fontSize.hero, fontWeight: '800', letterSpacing: -0.5 },
  title: { fontSize: fontSize.title, fontWeight: '700', letterSpacing: -0.3 },
  heading: { fontSize: fontSize.heading, fontWeight: '700' },
  body: { fontSize: fontSize.body },
  small: { fontSize: fontSize.small },
  caption: { fontSize: fontSize.caption },
  label: { fontSize: fontSize.small, fontWeight: '600' },
};

function toneColor(theme: Palette, tone: Tone): string {
  const map: Record<Tone, string> = {
    default: theme.text,
    muted: theme.textMuted,
    primary: theme.primary,
    danger: theme.danger,
    success: theme.success,
    warning: theme.warning,
    onPrimary: theme.onPrimary,
  };
  return map[tone];
}

export function AppText({
  variant = 'body',
  tone = 'default',
  style,
  ...props
}: TextProps & { variant?: Variant; tone?: Tone }) {
  const theme = useTheme();
  return <Text {...props} style={[variants[variant], { color: toneColor(theme, tone) }, style]} />;
}

/** Tab screens draw their own top inset: native tabs have no header. */
export function Screen({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <SafeAreaView edges={['top']} style={[{ flex: 1, backgroundColor: theme.background }, style]}>
      {children}
    </SafeAreaView>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View
      style={[
        {
          backgroundColor: theme.surface,
          borderRadius: radius.lg,
          borderWidth: 1,
          borderColor: theme.border,
          padding: space.lg,
          gap: space.md,
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({
  title,
  onPress,
  variant = 'primary',
  loading = false,
  disabled = false,
  icon,
  style,
}: {
  title: string;
  onPress: () => void;
  variant?: ButtonVariant;
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const theme = useTheme();
  const colors: Record<ButtonVariant, { bg: string; fg: string; border: string }> = {
    primary: { bg: theme.primary, fg: theme.onPrimary, border: theme.primary },
    secondary: { bg: theme.surface, fg: theme.text, border: theme.border },
    danger: { bg: theme.dangerSoft, fg: theme.danger, border: theme.dangerSoft },
    ghost: { bg: 'transparent', fg: theme.primary, border: 'transparent' },
  };
  const c = colors[variant];
  const inactive = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy: loading }}
      onPress={onPress}
      disabled={inactive}
      style={({ pressed }) => [
        {
          minHeight: 48,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: space.sm,
          paddingHorizontal: space.lg,
          borderRadius: radius.md,
          borderWidth: 1,
          backgroundColor: c.bg,
          borderColor: c.border,
          opacity: inactive ? 0.5 : pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      {loading ? <ActivityIndicator color={c.fg} /> : icon}
      <Text style={{ color: c.fg, fontSize: fontSize.body, fontWeight: '600' }}>{title}</Text>
    </Pressable>
  );
}

export function IconButton({
  onPress,
  children,
  label,
  disabled,
  filled = false,
}: {
  onPress: () => void;
  children: ReactNode;
  label: string;
  disabled?: boolean;
  filled?: boolean;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        borderRadius: radius.pill,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: filled ? theme.primary : pressed ? theme.surfaceMuted : 'transparent',
        opacity: disabled ? 0.4 : pressed ? 0.85 : 1,
      })}
    >
      {children}
    </Pressable>
  );
}

export function TextField({
  label,
  error,
  hint,
  style,
  ...props
}: TextInputProps & { label?: string; error?: string | null; hint?: string | null }) {
  const theme = useTheme();
  return (
    <View style={{ gap: space.xs }}>
      {label && <AppText variant="label">{label}</AppText>}
      <TextInput
        placeholderTextColor={theme.textMuted}
        {...props}
        style={[
          {
            minHeight: 48,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.md,
            borderWidth: 1,
            borderColor: error ? theme.danger : theme.border,
            backgroundColor: theme.surface,
            color: theme.text,
            fontSize: fontSize.body,
          },
          style,
        ]}
      />
      {error ? (
        <AppText variant="caption" tone="danger">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" tone="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

export function Chip({
  label,
  selected,
  onPress,
  color,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
  color?: string;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.xs,
        paddingHorizontal: space.md,
        paddingVertical: space.sm,
        borderRadius: radius.pill,
        borderWidth: 1,
        borderColor: selected ? theme.primary : theme.border,
        backgroundColor: selected ? theme.primarySoft : theme.surface,
      }}
    >
      {color && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: color }} />}
      <AppText
        variant="small"
        tone={selected ? 'primary' : 'default'}
        style={{ fontWeight: '600' }}
      >
        {label}
      </AppText>
    </Pressable>
  );
}

export function Section({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <AppText variant="heading">{title}</AppText>
        {action}
      </View>
      {children}
    </View>
  );
}

export function Divider() {
  const theme = useTheme();
  return <View style={{ height: 1, backgroundColor: theme.border }} />;
}
