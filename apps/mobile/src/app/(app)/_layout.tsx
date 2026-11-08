import { Stack } from 'expo-router';
import { useLiveUpdates } from '@/lib/live-updates';
import { useTheme } from '@/theme';

export default function AppLayout() {
  const theme = useTheme();
  useLiveUpdates();

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: theme.surface },
        headerTintColor: theme.text,
        headerShadowVisible: false,
        contentStyle: { backgroundColor: theme.background },
      }}
    >
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen
        name="transaction/new"
        options={{ title: 'Tambah Pengeluaran', presentation: 'modal' }}
      />
      <Stack.Screen
        name="transaction/[id]"
        options={{ title: 'Ubah Transaksi', presentation: 'modal' }}
      />
      <Stack.Screen
        name="category/new"
        options={{ title: 'Kategori Baru', presentation: 'modal' }}
      />
      <Stack.Screen name="pocket/[id]" options={{ title: 'Kantong' }} />
      <Stack.Screen name="pocket/new" options={{ title: 'Kantong Baru', presentation: 'modal' }} />
      <Stack.Screen
        name="pocket/edit/[id]"
        options={{ title: 'Ubah Kantong', presentation: 'modal' }}
      />
      <Stack.Screen
        name="pocket/topup/[id]"
        options={{ title: 'Isi Saldo', presentation: 'modal' }}
      />
      <Stack.Screen
        name="pocket/transfer"
        options={{ title: 'Pindahkan Saldo', presentation: 'modal' }}
      />
      <Stack.Screen
        name="category/[id]"
        options={{ title: 'Ubah Kategori', presentation: 'modal' }}
      />
    </Stack>
  );
}
