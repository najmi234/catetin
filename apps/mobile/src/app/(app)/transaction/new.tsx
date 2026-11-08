import { router } from 'expo-router';
import { TransactionForm } from '@/components/transaction-form';
import { useCreateTransaction } from '@/lib/queries';

export default function NewTransactionScreen() {
  const create = useCreateTransaction();
  return (
    <TransactionForm
      submitLabel="Simpan"
      pending={create.isPending}
      error={create.error?.message}
      onSubmit={(values) => create.mutate(values, { onSuccess: () => router.back() })}
    />
  );
}
