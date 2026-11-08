import { router } from 'expo-router';
import { ItemForm } from '@/components/item-form';
import { useCreateCategory } from '@/lib/queries';

export default function NewCategoryScreen() {
  const create = useCreateCategory();
  return (
    <ItemForm
      newLabel="Kategori baru"
      namePlaceholder="Contoh: Kopi, Kos, Bensin"
      defaultIcon="tag"
      showPocketPicker
      submitLabel="Simpan kategori"
      pending={create.isPending}
      error={create.error?.message}
      onSubmit={(values) => create.mutate(values, { onSuccess: () => router.back() })}
    />
  );
}
