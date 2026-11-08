import { router, useLocalSearchParams } from 'expo-router';
import { Trash } from 'lucide-react-native';
import { Alert } from 'react-native';
import { ItemForm } from '@/components/item-form';
import { ErrorView, Loading } from '@/components/states';
import { Button } from '@/components/ui';
import { useDeletePocket, usePocket, useUpdatePocket } from '@/lib/queries';
import { useTheme } from '@/theme';

export default function EditPocketScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const pocket = usePocket(id);
  const update = useUpdatePocket();
  const remove = useDeletePocket();

  if (pocket.isPending) return <Loading />;
  if (pocket.isError)
    return <ErrorView error={pocket.error} onRetry={() => void pocket.refetch()} />;

  function confirmDelete() {
    Alert.alert(
      `Hapus kantong "${pocket.data!.name}"?`,
      'Riwayat isi saldo kantong ini ikut terhapus. Pengeluarannya tetap tercatat, tetapi tanpa kantong.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          // Leave both the edit modal and the detail screen of the deleted pocket
          onPress: () => remove.mutate(id, { onSuccess: () => router.dismissTo('/pockets') }),
        },
      ],
    );
  }

  return (
    <ItemForm
      key={pocket.data.id}
      initial={pocket.data}
      newLabel="Kantong baru"
      namePlaceholder="Contoh: Bensin, Jajan, Kos dan Kuota"
      defaultIcon="wallet"
      submitLabel="Simpan perubahan"
      pending={update.isPending}
      error={update.error?.message ?? remove.error?.message}
      onSubmit={(values) =>
        update.mutate({ id, changes: values }, { onSuccess: () => router.back() })
      }
      footer={
        <Button
          title="Hapus kantong"
          variant="danger"
          icon={<Trash color={theme.danger} size={18} />}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      }
    />
  );
}
