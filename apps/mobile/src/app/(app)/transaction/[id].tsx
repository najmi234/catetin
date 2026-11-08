import { router, useLocalSearchParams } from 'expo-router';
import { Trash } from 'lucide-react-native';
import { Alert } from 'react-native';
import { ErrorView, Loading } from '@/components/states';
import { TransactionForm } from '@/components/transaction-form';
import { Button } from '@/components/ui';
import { useDeleteTransaction, useTransaction, useUpdateTransaction } from '@/lib/queries';
import { useTheme } from '@/theme';

export default function EditTransactionScreen() {
  const theme = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const transaction = useTransaction(id);
  const update = useUpdateTransaction();
  const remove = useDeleteTransaction();

  if (transaction.isPending) return <Loading />;
  if (transaction.isError) {
    return <ErrorView error={transaction.error} onRetry={() => void transaction.refetch()} />;
  }

  function confirmDelete() {
    Alert.alert('Hapus transaksi?', `${transaction.data!.merchant} akan dihapus permanen.`, [
      { text: 'Batal', style: 'cancel' },
      {
        text: 'Hapus',
        style: 'destructive',
        onPress: () => remove.mutate(id, { onSuccess: () => router.back() }),
      },
    ]);
  }

  return (
    <TransactionForm
      // Remount when the transaction changes underneath (e.g. edited on another device)
      key={transaction.data.id}
      initial={transaction.data}
      submitLabel="Simpan perubahan"
      pending={update.isPending}
      error={update.error?.message ?? remove.error?.message}
      onSubmit={(values) =>
        // Unchanged category/pocket arrive as undefined and are left alone by the server;
        // a new category with an untouched pocket moves the expense to that category's pocket
        update.mutate({ id, changes: values }, { onSuccess: () => router.back() })
      }
      footer={
        <Button
          title="Hapus transaksi"
          variant="danger"
          icon={<Trash color={theme.danger} size={18} />}
          loading={remove.isPending}
          onPress={confirmDelete}
        />
      }
    />
  );
}
