import { formatRupiah, parseAmount } from '@catetin/shared';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { ErrorView, Loading } from '@/components/states';
import { AppText, Button, Chip, TextField } from '@/components/ui';
import type { Pocket } from '@/lib/api';
import { usePockets, useTransferPockets } from '@/lib/queries';
import { space } from '@/theme';

export default function TransferScreen() {
  const { from: initialFrom } = useLocalSearchParams<{ from?: string }>();
  const pockets = usePockets();
  const transfer = useTransferPockets();
  const [from, setFrom] = useState<string | null>(initialFrom ?? null);
  const [to, setTo] = useState<string | null>(null);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const [touched, setTouched] = useState(false);

  if (pockets.isPending) return <Loading />;
  if (pockets.isError) {
    return <ErrorView error={pockets.error} onRetry={() => void pockets.refetch()} />;
  }

  const amount = amountText.trim() ? parseAmount(amountText) : null;
  const error = !touched
    ? null
    : !from || !to
      ? 'Pilih kantong asal dan tujuan.'
      : from === to
        ? 'Kantong asal dan tujuan harus berbeda.'
        : amount === null
          ? 'Nominal tidak valid.'
          : null;

  function submit() {
    setTouched(true);
    if (!from || !to || from === to || amount === null) return;
    transfer.mutate(
      { fromPocketId: from, toPocketId: to, amount, note: note.trim() || null },
      { onSuccess: () => router.back() },
    );
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <PocketPicker label="Dari" pockets={pockets.data} selected={from} onSelect={setFrom} />
      <PocketPicker label="Ke" pockets={pockets.data} selected={to} onSelect={setTo} />
      <TextField
        label="Nominal"
        placeholder="50000 atau 50rb"
        value={amountText}
        onChangeText={setAmountText}
        autoCapitalize="none"
        hint={amount !== null ? formatRupiah(amount) : null}
      />
      <TextField label="Catatan (opsional)" value={note} onChangeText={setNote} />
      {(error ?? transfer.error?.message) && (
        <AppText tone="danger">{error ?? transfer.error?.message}</AppText>
      )}
      <Button title="Pindahkan" onPress={submit} loading={transfer.isPending} />
    </ScrollView>
  );
}

function PocketPicker({
  label,
  pockets,
  selected,
  onSelect,
}: {
  label: string;
  pockets: Pocket[];
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="label">{label}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
        {pockets.map((p) => (
          <Chip
            key={p.id}
            label={`${p.name} · ${formatRupiah(p.balance)}`}
            color={p.color}
            selected={selected === p.id}
            onPress={() => onSelect(p.id)}
          />
        ))}
      </View>
    </View>
  );
}
