import { currentYearMonth, formatRupiah } from '@catetin/shared';
import { router } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';
import { CategoryBreakdown, DailyChart } from '@/components/charts';
import { MonthSwitcher } from '@/components/month-switcher';
import { QuickAdd } from '@/components/quick-add';
import { Empty, ErrorView, Loading } from '@/components/states';
import { TransactionRow } from '@/components/transaction-row';
import { AppText, Button, Card, Divider, IconButton, Screen, Section } from '@/components/ui';
import { useSummary, useTransactions } from '@/lib/queries';
import { space, useTheme } from '@/theme';

const RECENT_COUNT = 5;

export default function DashboardScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(currentYearMonth);
  const summary = useSummary(month);
  const transactions = useTransactions(month);

  const refreshing = summary.isRefetching || transactions.isRefetching;
  const refresh = () => {
    void summary.refetch();
    void transactions.refetch();
  };

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} />}
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="title">Catetin</AppText>
          <IconButton
            label="Tambah pengeluaran"
            filled
            onPress={() => router.push('/transaction/new')}
          >
            <Plus color={theme.onPrimary} size={22} />
          </IconButton>
        </View>

        <QuickAdd />

        <View style={{ alignItems: 'center' }}>
          <MonthSwitcher month={month} onChange={setMonth} />
        </View>

        {summary.isPending ? (
          <Loading />
        ) : summary.isError ? (
          <ErrorView error={summary.error} onRetry={() => void summary.refetch()} />
        ) : (
          <>
            <Card style={{ backgroundColor: theme.primary, borderColor: theme.primary }}>
              <AppText variant="small" tone="onPrimary" style={{ opacity: 0.85 }}>
                Total pengeluaran
              </AppText>
              <AppText variant="hero" tone="onPrimary" style={{ fontVariant: ['tabular-nums'] }}>
                {formatRupiah(summary.data.total)}
              </AppText>
              <View style={{ flexDirection: 'row', gap: space.xl }}>
                <Stat label="Transaksi" value={String(summary.data.count)} />
                <Stat
                  label="Rata-rata / hari aktif"
                  value={formatRupiah(summary.data.averagePerActiveDay)}
                />
              </View>
            </Card>

            {summary.data.count === 0 ? (
              <Empty
                title="Belum ada pengeluaran"
                hint="Catat lewat kolom di atas, tombol +, atau kirim pesan WhatsApp ke diri sendiri."
              />
            ) : (
              <>
                <Card>
                  <AppText variant="heading">Pengeluaran harian</AppText>
                  <DailyChart summary={summary.data} />
                </Card>
                <Card>
                  <AppText variant="heading">Per kategori</AppText>
                  <CategoryBreakdown summary={summary.data} />
                </Card>
              </>
            )}
          </>
        )}

        {transactions.data && transactions.data.length > 0 && (
          <Section
            title="Terbaru"
            action={
              <Button
                title="Lihat semua"
                variant="ghost"
                onPress={() => router.navigate('/history')}
              />
            }
          >
            <Card style={{ paddingVertical: 0, gap: 0 }}>
              {transactions.data.slice(0, RECENT_COUNT).map((t, i) => (
                <View key={t.id}>
                  {i > 0 && <Divider />}
                  <TransactionRow
                    transaction={t}
                    onPress={() =>
                      router.push({ pathname: '/transaction/[id]', params: { id: t.id } })
                    }
                  />
                </View>
              ))}
            </Card>
          </Section>
        )}
      </ScrollView>
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" tone="onPrimary" style={{ opacity: 0.8 }}>
        {label}
      </AppText>
      <AppText variant="label" tone="onPrimary" style={{ fontVariant: ['tabular-nums'] }}>
        {value}
      </AppText>
    </View>
  );
}
