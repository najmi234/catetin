import { currentYearMonth, formatDayLabel, formatRupiah, toZonedParts } from '@catetin/shared';
import { router } from 'expo-router';
import { Plus, Search } from 'lucide-react-native';
import { useDeferredValue, useState } from 'react';
import { RefreshControl, SectionList, TextInput, View } from 'react-native';
import { MonthSwitcher } from '@/components/month-switcher';
import { Empty, ErrorView, Loading } from '@/components/states';
import { TransactionRow } from '@/components/transaction-row';
import { AppText, IconButton, Screen } from '@/components/ui';
import type { Transaction } from '@/lib/api';
import { useTransactions } from '@/lib/queries';
import { fontSize, radius, space, useTheme } from '@/theme';

interface DaySection {
  key: string;
  title: string;
  total: number;
  data: Transaction[];
}

/** Transactions arrive newest first; group them by WIB calendar day. */
function groupByDay(transactions: Transaction[]): DaySection[] {
  const sections: DaySection[] = [];
  for (const t of transactions) {
    const date = new Date(t.occurredAt);
    const { year, month, day } = toZonedParts(date);
    const key = `${year}-${month}-${day}`;
    let section = sections.at(-1);
    if (section?.key !== key) {
      section = { key, title: formatDayLabel(date), total: 0, data: [] };
      sections.push(section);
    }
    section.total += t.amount;
    section.data.push(t);
  }
  return sections;
}

export default function HistoryScreen() {
  const theme = useTheme();
  const [month, setMonth] = useState(currentYearMonth);
  const [search, setSearch] = useState('');
  const query = useDeferredValue(search.trim());
  const transactions = useTransactions(month, query);
  const sections = transactions.data ? groupByDay(transactions.data) : [];

  return (
    <Screen>
      <View style={{ paddingHorizontal: space.lg, paddingTop: space.lg, gap: space.md }}>
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="title">Riwayat</AppText>
          <MonthSwitcher month={month} onChange={setMonth} />
        </View>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: space.sm,
            paddingHorizontal: space.md,
            borderRadius: radius.md,
            backgroundColor: theme.surface,
            borderWidth: 1,
            borderColor: theme.border,
          }}
        >
          <Search color={theme.textMuted} size={18} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Cari keterangan, catatan, kategori"
            placeholderTextColor={theme.textMuted}
            accessibilityLabel="Cari transaksi"
            autoCapitalize="none"
            style={{ flex: 1, minHeight: 44, color: theme.text, fontSize: fontSize.body }}
          />
        </View>
      </View>

      {transactions.isPending ? (
        <Loading />
      ) : transactions.isError ? (
        <ErrorView error={transactions.error} onRetry={() => void transactions.refetch()} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(t) => t.id}
          stickySectionHeadersEnabled
          contentContainerStyle={{ paddingHorizontal: space.lg, paddingBottom: 96 }}
          refreshControl={
            <RefreshControl
              refreshing={transactions.isRefetching}
              onRefresh={() => void transactions.refetch()}
            />
          }
          renderSectionHeader={({ section }) => (
            <View
              style={{
                flexDirection: 'row',
                justifyContent: 'space-between',
                paddingTop: space.lg,
                paddingBottom: space.xs,
                backgroundColor: theme.background,
              }}
            >
              <AppText variant="label">{section.title}</AppText>
              <AppText variant="label" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {formatRupiah(section.total)}
              </AppText>
            </View>
          )}
          renderItem={({ item }) => (
            <TransactionRow
              transaction={item}
              onPress={() =>
                router.push({ pathname: '/transaction/[id]', params: { id: item.id } })
              }
            />
          )}
          ListEmptyComponent={
            query ? (
              <Empty
                title="Tidak ditemukan"
                hint={`Tidak ada transaksi yang cocok dengan "${query}".`}
              />
            ) : (
              <Empty title="Belum ada transaksi" hint="Belum ada pengeluaran di bulan ini." />
            )
          }
        />
      )}

      <View style={{ position: 'absolute', right: space.lg, bottom: space.lg }}>
        <IconButton
          label="Tambah pengeluaran"
          filled
          onPress={() => router.push('/transaction/new')}
        >
          <Plus color={theme.onPrimary} size={22} />
        </IconButton>
      </View>
    </Screen>
  );
}
