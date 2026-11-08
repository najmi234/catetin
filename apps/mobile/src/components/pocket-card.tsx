import { formatRupiah } from '@catetin/shared';
import { Pressable } from 'react-native';
import type { Pocket } from '@/lib/api';
import { radius, space, useTheme } from '@/theme';
import { CategoryIcon } from './category-icon';
import { AppText } from './ui';

export function PocketCard({ pocket, onPress }: { pocket: Pocket; onPress: () => void }) {
  const theme = useTheme();
  const negative = pocket.balance < 0;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Kantong ${pocket.name}, saldo ${formatRupiah(pocket.balance)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flex: 1,
        minHeight: 132,
        padding: space.lg,
        gap: space.sm,
        borderRadius: radius.lg,
        borderWidth: 1,
        borderColor: negative ? theme.danger : theme.border,
        // The pocket colour at ~8% opacity
        backgroundColor: pressed ? theme.surfaceMuted : `${pocket.color}14`,
      })}
    >
      <CategoryIcon icon={pocket.icon} color={pocket.color} size={40} />
      <AppText variant="heading" numberOfLines={1}>
        {pocket.name}
      </AppText>
      <AppText
        tone={negative ? 'danger' : 'default'}
        style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}
      >
        {formatRupiah(pocket.balance)}
      </AppText>
    </Pressable>
  );
}
