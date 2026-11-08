import { currentYearMonth, formatDayLabel, formatRupiah, formatTime } from '@catetin/shared';
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { ArrowDownLeft, ArrowLeftRight, Pencil, Plus } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, View } from 'react-native';
import { CategoryIcon } from '@/components/category-icon';
import { MonthSwitcher } from '@/components/month-switcher';
import { Empty, ErrorView, Loading } from '@/components/states';
import { AppText, Button, Card, Divider } from '@/components/ui';
import type { PocketActivity } from '@/lib/api';
import { useCategories, usePocket, usePocketActivity, useRemovePocketEntry } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export default function PocketDetailScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [month, setMonth] = useState(currentYearMonth);
  const pocket = usePocket(id);
  const activity = usePocketActivity(id, month);
  const categories = useCategories();
  const removeEntry = useRemovePocketEntry();

  if (pocket.isPending) return <Loading />;
  if (pocket.isError)
    return <ErrorView error={pocket.error} onRetry={() => void pocket.refetch()} />;

  const p = pocket.data;
  const linked = categories.data?.filter((c) => c.pocketId === p.id) ?? [];

  function openItem(item: PocketActivity) {
    if (item.transactionId) {
      router.push({ pathname: '/transaction/[id]', params: { id: item.transactionId } });
      return;
    }
    const what = item.kind === 'topup' ? 'isi saldo' : 'pemindahan (kedua sisinya)';
    Alert.alert(
      'Batalkan catatan ini?',
      `${formatRupiah(Math.abs(item.amount))} — ${what} akan dihapus.`,
      [
        { text: 'Tidak', style: 'cancel' },
        { text: 'Hapus', style: 'destructive', onPress: () => removeEntry.mutate(item.id) },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: p.name }} />
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={pocket.isRefetching || activity.isRefetching}
            onRefresh={() => {
              void pocket.refetch();
              void activity.refetch();
            }}
          />
        }
      >
        <Card style={{ alignItems: 'center' }}>
          <CategoryIcon icon={p.icon} color={p.color} size={56} />
          <AppText variant="small" tone="muted">
            Saldo
          </AppText>
          <AppText
            variant="hero"
            tone={p.balance < 0 ? 'danger' : 'default'}
            style={{ fontVariant: ['tabular-nums'] }}
          >
            {formatRupiah(p.balance)}
          </AppText>
          {p.balance < 0 && (
            <AppText variant="caption" tone="danger">
              Pengeluaran melebihi saldo kantong ini.
            </AppText>
          )}
          <View style={{ flexDirection: 'row', gap: space.sm, alignSelf: 'stretch' }}>
            <Button
              title="Isi"
              icon={<Plus color={theme.onPrimary} size={18} />}
              onPress={() => router.push({ pathname: '/pocket/topup/[id]', params: { id: p.id } })}
              style={{ flex: 1 }}
            />
            <Button
              title="Pindah"
              variant="secondary"
              icon={<ArrowLeftRight color={theme.text} size={18} />}
              onPress={() => router.push({ pathname: '/pocket/transfer', params: { from: p.id } })}
              style={{ flex: 1 }}
            />
            <Button
              title="Ubah"
              variant="secondary"
              icon={<Pencil color={theme.text} size={18} />}
              onPress={() => router.push({ pathname: '/pocket/edit/[id]', params: { id: p.id } })}
              style={{ flex: 1 }}
            />
          </View>
        </Card>

        <AppText variant="caption" tone="muted">
          {linked.length > 0
            ? `Otomatis dari kategori: ${linked.map((c) => c.name).join(', ')}. Di WhatsApp: $${p.name.split(' ')[0]!.toLowerCase()}`
            : 'Belum ada kategori yang terhubung. Atur di Pengaturan → Kategori, atau pilih kantong saat mencatat.'}
        </AppText>

        <View style={{ alignItems: 'center' }}>
          <MonthSwitcher month={month} onChange={setMonth} />
        </View>

        {activity.isPending ? (
          <Loading />
        ) : activity.isError ? (
          <ErrorView error={activity.error} onRetry={() => void activity.refetch()} />
        ) : activity.data.length === 0 ? (
          <Empty
            title="Belum ada aktivitas"
            hint="Tidak ada isi saldo atau pengeluaran bulan ini."
          />
        ) : (
          <Card style={{ paddingVertical: 0, gap: 0 }}>
            {activity.data.map((item, i) => (
              <View key={`${item.kind}-${item.id}`}>
                {i > 0 && <Divider />}
                <ActivityRow item={item} onPress={() => openItem(item)} />
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
    </>
  );
}

function ActivityRow({ item, onPress }: { item: PocketActivity; onPress: () => void }) {
  const theme = useTheme();
  const date = new Date(item.occurredAt);
  const incoming = item.amount > 0;
  const Icon = item.kind === 'topup' ? ArrowDownLeft : ArrowLeftRight;

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: space.md,
        paddingVertical: space.md,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      {item.kind === 'expense' ? (
        <CategoryIcon icon={item.category?.icon} color={item.category?.color} />
      ) : (
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: incoming ? theme.successSoft : theme.surfaceMuted,
          }}
        >
          <Icon color={incoming ? theme.success : theme.textMuted} size={18} />
        </View>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <AppText numberOfLines={1} style={{ fontWeight: '600' }}>
          {item.title}
        </AppText>
        <AppText variant="caption" tone="muted" numberOfLines={1}>
          {formatDayLabel(date)} · {formatTime(date)}
          {item.note ? ` · ${item.note}` : ''}
        </AppText>
      </View>
      <AppText
        tone={incoming ? 'success' : 'default'}
        style={{ fontWeight: '700', fontVariant: ['tabular-nums'] }}
      >
        {incoming ? '+' : ''}
        {formatRupiah(item.amount)}
      </AppText>
    </Pressable>
  );
}
