import { router } from 'expo-router';
import { ChevronRight, LogOut, Plus } from 'lucide-react-native';
import { Alert, Pressable, ScrollView, View } from 'react-native';
import { CategoryIcon } from '@/components/category-icon';
import { ErrorView, Loading } from '@/components/states';
import { AppText, Button, Card, Divider, Screen, Section } from '@/components/ui';
import { authClient } from '@/lib/auth-client';
import { API_URL } from '@/lib/config';
import { useCategories, usePockets } from '@/lib/queries';
import { space, useTheme } from '@/theme';

export default function SettingsScreen() {
  const theme = useTheme();
  const { data: session } = authClient.useSession();
  const categories = useCategories();
  const pockets = usePockets();
  const pocketName = (id: string | null) => pockets.data?.find((p) => p.id === id)?.name;

  function confirmSignOut() {
    Alert.alert('Keluar?', 'Kamu perlu kode dari email untuk masuk lagi.', [
      { text: 'Batal', style: 'cancel' },
      { text: 'Keluar', style: 'destructive', onPress: () => void authClient.signOut() },
    ]);
  }

  return (
    <Screen>
      <ScrollView contentContainerStyle={{ padding: space.lg, gap: space.xl }}>
        <AppText variant="title">Pengaturan</AppText>

        <Section
          title="Kategori"
          action={
            <Button
              title="Tambah"
              variant="ghost"
              icon={<Plus color={theme.primary} size={18} />}
              onPress={() => router.push('/category/new')}
            />
          }
        >
          {categories.isPending ? (
            <Loading />
          ) : categories.isError ? (
            <ErrorView error={categories.error} onRetry={() => void categories.refetch()} />
          ) : (
            <Card style={{ paddingVertical: 0, gap: 0 }}>
              {categories.data.map((c, i) => (
                <View key={c.id}>
                  {i > 0 && <Divider />}
                  <Pressable
                    accessibilityRole="button"
                    onPress={() =>
                      router.push({ pathname: '/category/[id]', params: { id: c.id } })
                    }
                    style={({ pressed }) => ({
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: space.md,
                      paddingVertical: space.md,
                      opacity: pressed ? 0.7 : 1,
                    })}
                  >
                    <CategoryIcon icon={c.icon} color={c.color} size={32} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <AppText>{c.name}</AppText>
                      {pocketName(c.pocketId) && (
                        <AppText variant="caption" tone="muted">
                          Kantong: {pocketName(c.pocketId)}
                        </AppText>
                      )}
                    </View>
                    <ChevronRight color={theme.textMuted} size={18} />
                  </Pressable>
                </View>
              ))}
            </Card>
          )}
          <AppText variant="caption" tone="muted">
            Di WhatsApp, pakai awalan nama kategori sebagai tag, misalnya #makan untuk "Makanan &
            Minuman", dan $ untuk kantong, misalnya $bensin.
          </AppText>
        </Section>

        <Section title="Akun">
          <Card>
            <InfoRow label="Email" value={session?.user.email ?? '-'} />
            <Divider />
            <InfoRow label="Server" value={API_URL || '-'} />
          </Card>
          <Button
            title="Keluar"
            variant="danger"
            icon={<LogOut color={theme.danger} size={18} />}
            onPress={confirmSignOut}
          />
        </Section>
      </ScrollView>
    </Screen>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="caption" tone="muted">
        {label}
      </AppText>
      <AppText selectable>{value}</AppText>
    </View>
  );
}
