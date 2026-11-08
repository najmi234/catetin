import { formatRupiah } from '@catetin/shared';
import { router } from 'expo-router';
import { ArrowLeftRight, Plus } from 'lucide-react-native';
import { RefreshControl, ScrollView, View } from 'react-native';
import { PocketCard } from '@/components/pocket-card';
import { Empty, ErrorView, Loading } from '@/components/states';
import { AppText, Button, Card, IconButton, Screen } from '@/components/ui';
import type { Pocket } from '@/lib/api';
import { usePockets } from '@/lib/queries';
import { space, useTheme } from '@/theme';

/** [[a, b], [c, d], [e]] — two cards per row. */
function pairs(pockets: Pocket[]): Pocket[][] {
  const rows: Pocket[][] = [];
  for (let i = 0; i < pockets.length; i += 2) rows.push(pockets.slice(i, i + 2));
  return rows;
}

export default function PocketsScreen() {
  const theme = useTheme();
  const pockets = usePockets();
  const total = pockets.data?.reduce((sum, p) => sum + p.balance, 0) ?? 0;
  const negatives = pockets.data?.filter((p) => p.balance < 0).length ?? 0;

  return (
    <Screen>
      <ScrollView
        contentContainerStyle={{ padding: space.lg, gap: space.lg, paddingBottom: space.xxl }}
        refreshControl={
          <RefreshControl
            refreshing={pockets.isRefetching}
            onRefresh={() => void pockets.refetch()}
          />
        }
      >
        <View
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
        >
          <AppText variant="title">Kantong</AppText>
          <IconButton label="Buat kantong" filled onPress={() => router.push('/pocket/new')}>
            <Plus color={theme.onPrimary} size={22} />
          </IconButton>
        </View>

        {pockets.isPending ? (
          <Loading />
        ) : pockets.isError ? (
          <ErrorView error={pockets.error} onRetry={() => void pockets.refetch()} />
        ) : pockets.data.length === 0 ? (
          <Empty
            title="Belum ada kantong"
            hint="Buat kantong seperti Bensin, Jajan, atau Kos, lalu hubungkan ke kategori di Pengaturan agar pengeluaran otomatis mengurangi saldonya."
          />
        ) : (
          <>
            <Card>
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <AppText variant="heading">Total saldo</AppText>
                <AppText
                  variant="heading"
                  tone={total < 0 ? 'danger' : 'default'}
                  style={{ fontVariant: ['tabular-nums'] }}
                >
                  {formatRupiah(total)}
                </AppText>
              </View>
              {negatives > 0 && (
                <AppText variant="caption" tone="danger">
                  {negatives} kantong bersaldo minus
                </AppText>
              )}
              <Button
                title="Pindahkan saldo"
                variant="secondary"
                icon={<ArrowLeftRight color={theme.text} size={18} />}
                onPress={() => router.push('/pocket/transfer')}
                disabled={pockets.data.length < 2}
              />
            </Card>

            <View style={{ gap: space.md }}>
              {pairs(pockets.data).map((row) => (
                <View key={row[0]!.id} style={{ flexDirection: 'row', gap: space.md }}>
                  {row.map((p) => (
                    <PocketCard
                      key={p.id}
                      pocket={p}
                      onPress={() =>
                        router.push({ pathname: '/pocket/[id]', params: { id: p.id } })
                      }
                    />
                  ))}
                  {/* Keep a lone last card at half width */}
                  {row.length === 1 && <View style={{ flex: 1 }} />}
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
