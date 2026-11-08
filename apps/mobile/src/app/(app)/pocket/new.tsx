import { router } from 'expo-router';
import { ItemForm } from '@/components/item-form';
import { useCreatePocket } from '@/lib/queries';

export default function NewPocketScreen() {
  const create = useCreatePocket();
  return (
    <ItemForm
      newLabel="Kantong baru"
      namePlaceholder="Contoh: Bensin, Jajan, Kos dan Kuota"
      defaultIcon="wallet"
      defaultColor="#F59E0B"
      submitLabel="Buat kantong"
      pending={create.isPending}
      error={create.error?.message}
      onSubmit={(values) => create.mutate(values, { onSuccess: () => router.back() })}
    />
  );
}
