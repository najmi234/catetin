import { router, useLocalSearchParams } from 'expo-router';
import { Trash } from 'lucide-react-native';
import { Alert } from 'react-native';
import { ItemForm } from '@/components/item-form';
import { ErrorView, Loading } from '@/components/states';
import { Button } from '@/components/ui';
import { useCategories, useDeleteCategory, useUpdateCategory } from '@/lib/queries';
import { useTheme } from '@/theme';

export default function EditCategoryScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useCategories();
  const update = useUpdateCategory();
  const remove = useDeleteCategory();

  if (categories.isPending) return <Loading />;
  if (categories.isError) {
    return <ErrorView error={categories.error} onRetry={() => void categories.refetch()} />;
  }
  const category = categories.data.find((c) => c.id === id);
  if (!category) return <ErrorView error={new Error('Kategori tidak ditemukan.')} />;

  function confirmDelete() {
    Alert.alert(
      `Hapus "${category!.name}"?`,
      'Transaksi di kategori ini tetap ada, tetapi menjadi tanpa kategori.',
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Hapus',
          style: 'destructive',
          onPress: () => remove.mutate(id, { onSuccess: () => router.back() }),
        },
      ],
    );
  }

  return (
    <ItemForm
      newLabel="Kategori baru"
      namePlaceholder="Contoh: Kopi, Kos, Bensin"
      defaultIcon="tag"
      showPocketPicker
      key={category.id}
      initial={category}
      submitLabel="Simpan perubahan"
      pending={update.isPending}
      error={update.error?.message ?? remove.error?.message}
      onSubmit={(values) =>
        update.mutate({ id, changes: values }, { onSuccess: () => router.back() })
      }
      footer={
        <Button
          title="Hapus kategori"
          variant="danger"
          icon={<Trash color={theme.danger} size={18} />}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      }
    />
  );
}
