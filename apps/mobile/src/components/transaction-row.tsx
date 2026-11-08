import { formatRupiah } from '@catetin/shared';
import { Pressable, View } from 'react-native';
import type { Transaction } from '@/lib/api';
import { transactionSubtitle } from '@/lib/format';
import { space, useTheme } from '@/theme';
import { CategoryIcon } from './category-icon';
import { AppText } from './ui';

export function TransactionRow({
  transaction: t,
  onPress,
}: {
  transaction: Transaction;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.merchant}, ${formatRupiah(t.amount)}`}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        backgroundColor: pressed ? theme.surfaceMuted : 'transparent',
      })}
    >
      <CategoryIcon icon={t.category?.icon} color={t.category?.color} />
      <View style={{ flex: 1, gap: 2 }}>
        <AppText numberOfLines={1} style={{ fontWeight: '600' }}>
          {t.merchant}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {t.category?.name ?? 'Tanpa kategori'} · {transactionSubtitle(t)}
        </AppText>
      </View>
      <AppText style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}>
        {formatRupiah(t.amount)}
      </AppText>
    </Pressable>
  );
}
