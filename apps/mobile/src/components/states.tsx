import { ActivityIndicator, View } from 'react-native';
import { space, useTheme } from '@/theme';
import { AppText, Button } from './ui';

export function Loading({ label = 'Memuat…' }: { label?: string }) {
  const theme = useTheme();
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.md }}>
      <ActivityIndicator color={theme.primary} />
      <AppText tone="muted">{label}</AppText>
    </View>
  );
}

export function ErrorView({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof Error ? error.message : 'Terjadi kesalahan.';
  return (
    <View style={{ padding: space.xl, alignItems: 'center', gap: space.md }}>
      <AppText tone="danger" style={{ textAlign: 'center' }}>
        {message}
      </AppText>
      {onRetry && <Button title="Coba lagi" variant="secondary" onPress={onRetry} />}
    </View>
  );
}

export function Empty({ title, hint }: { title: string; hint?: string }) {
  return (
    <View style={{ padding: space.xxl, alignItems: 'center', gap: space.xs }}>
      <AppText variant="heading" style={{ textAlign: 'center' }}>
        {title}
      </AppText>
      {hint && (
        <AppText tone="muted" style={{ textAlign: 'center' }}>
          {hint}
        </AppText>
      )}
    </View>
  );
}
