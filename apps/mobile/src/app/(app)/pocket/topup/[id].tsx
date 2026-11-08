import { formatRupiah, parseAmount } from '@catetin/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';
import { ErrorView, Loading } from '@/components/states';
import { AppText, Button, TextField } from '@/components/ui';
import { usePocket, useTopUpPocket } from '@/lib/queries';
import { space } from '@/theme';

export default function TopUpScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const pocket = usePocket(id);
  const topUp = useTopUpPocket();
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  if (pocket.isPending) return <Loading />;
  if (pocket.isError)
    return <ErrorView error={pocket.error} onRetry={() => void pocket.refetch()} />;

  const amount = amountText.trim() ? parseAmount(amountText) : null;

  function submit() {
    setTouched(true);
    if (amount === null) return;
    topUp.mutate(
      { id, input: { amount, note: note.trim() || null } },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <AppText tone="muted">
        Saldo {pocket.data.name} sekarang {formatRupiah(pocket.data.balance)}
        {amount !== null ? `, menjadi ${formatRupiah(pocket.data.balance + amount)}.` : '.'}
      </AppText>
      <TextField
        label="Nominal"
        placeholder="300000 atau 300rb"
        value={amountText}
        onChangeText={setAmountText}
        autoCapitalize="none"
        autoFocus
        error={
          touched && amount === null ? 'Nominal tidak valid. Contoh: 300000, 300rb, 1,5jt' : null
        }
        hint={amount !== null ? formatRupiah(amount) : null}
        onSubmitEditing={submit}
      />
      <TextField label="Catatan (opsional)" value={note} onChangeText={setNote} />
      {topUp.error && <AppText tone="danger">{topUp.error.message}</AppText>}
      <Button title="Isi saldo" onPress={submit} loading={topUp.isPending} />
    </ScrollView>
  );
}
