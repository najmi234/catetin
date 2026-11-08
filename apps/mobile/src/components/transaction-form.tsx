import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  formatDate,
  formatRupiah,
  formatTime,
  fromWibParts,
  parseAmount,
  toZonedParts,
  type PaymentMethod,
} from '@catetin/shared';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { Calendar, Clock } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { ScrollView, View } from 'react-native';
import type { Transaction } from '@/lib/api';
import { useCategories, usePockets } from '@/lib/queries';
import { space, useTheme } from '@/theme';
import { AppText, Button, Chip, TextField } from './ui';

export interface TransactionFormValues {
  merchant: string;
  amount: number;
  /** New: undefined = guess from the merchant history. Edit: undefined = unchanged. */
  categoryId: string | null | undefined;
  /** undefined = the category's pocket (or, when editing, unchanged); null = no pocket */
  pocketId: string | null | undefined;
  paymentMethod: PaymentMethod;
  note: string | null;
  occurredAt: string;
}

const AUTO = 'auto';
const FOLLOW = 'follow';

/**
 * The picker works in device-local time. Hand it a Date whose local fields equal the
 * WIB wall clock, and read the result back the same way, so the form is in WIB
 * regardless of the phone's time zone.
 */
function openPicker(mode: 'date' | 'time', value: Date, onPick: (date: Date) => void) {
  const p = toZonedParts(value);
  DateTimePickerAndroid.open({
    mode,
    is24Hour: true,
    value: new Date(p.year, p.month - 1, p.day, p.hour, p.minute),
    onChange: (event, picked) => {
      if (event.type !== 'set' || !picked) return;
      onPick(
        fromWibParts({
          year: picked.getFullYear(),
          month: picked.getMonth() + 1,
          day: picked.getDate(),
          hour: picked.getHours(),
          minute: picked.getMinutes(),
        }),
      );
    },
  });
}

export function TransactionForm({
  initial,
  submitLabel,
  pending,
  error,
  onSubmit,
  footer,
}: {
  initial?: Transaction;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (values: TransactionFormValues) => void;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const categories = useCategories();
  const pockets = usePockets();

  const [merchant, setMerchant] = useState(initial?.merchant ?? '');
  const [amountText, setAmountText] = useState(initial ? String(initial.amount) : '');
  const [categoryId, setCategoryId] = useState<string | null>(
    initial ? (initial.category?.id ?? null) : AUTO,
  );
  // FOLLOW = take the category's pocket. When editing, the current pocket is preselected,
  // but it only counts as a choice once touched — so changing just the category moves
  // the expense to that category's pocket.
  const [pocketId, setPocketId] = useState<string | null>(
    initial ? (initial.pocket?.id ?? null) : FOLLOW,
  );
  const [pocketTouched, setPocketTouched] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(
    initial?.paymentMethod ?? 'cash',
  );
  const [note, setNote] = useState(initial?.note ?? '');
  const [occurredAt, setOccurredAt] = useState(initial ? new Date(initial.occurredAt) : new Date());
  const [touched, setTouched] = useState(false);

  const amount = amountText.trim() ? parseAmount(amountText) : null;
  const merchantError = touched && !merchant.trim() ? 'Keterangan wajib diisi' : null;
  const amountError =
    touched && amount === null ? 'Nominal tidak valid. Contoh: 15000, 15.000, 15k, 1,5jt' : null;

  function submit() {
    setTouched(true);
    if (!merchant.trim() || amount === null) return;
    onSubmit({
      merchant: merchant.trim(),
      amount,
      // Editing sends only what changed: undefined leaves the field as it is
      categoryId:
        categoryId === AUTO || (initial && categoryId === (initial.category?.id ?? null))
          ? undefined
          : categoryId,
      pocketId: pocketId === FOLLOW || (initial && !pocketTouched) ? undefined : pocketId,
      paymentMethod,
      note: note.trim() || null,
      occurredAt: occurredAt.toISOString(),
    });
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <TextField
        label="Keterangan"
        placeholder="Contoh: Kopi, Grab, Makan siang"
        value={merchant}
        onChangeText={setMerchant}
        error={merchantError}
        autoFocus={!initial}
      />
      <TextField
        label="Nominal"
        placeholder="15000 atau 15k"
        value={amountText}
        onChangeText={setAmountText}
        keyboardType="default"
        autoCapitalize="none"
        error={amountError}
        hint={amount !== null ? formatRupiah(amount) : null}
      />

      <View style={{ gap: space.sm }}>
        <AppText variant="label">Kategori</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {initial ? (
            <Chip
              label="Tanpa kategori"
              selected={categoryId === null}
              onPress={() => setCategoryId(null)}
            />
          ) : (
            <Chip
              label="Otomatis"
              selected={categoryId === AUTO}
              onPress={() => setCategoryId(AUTO)}
            />
          )}
          {categories.data?.map((c) => (
            <Chip
              key={c.id}
              label={c.name}
              color={c.color}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </View>
        {categoryId === AUTO && (
          <AppText variant="caption" tone="muted">
            Kategori diambil dari catatan sebelumnya dengan keterangan yang sama.
          </AppText>
        )}
      </View>

      {pockets.data && pockets.data.length > 0 && (
        <View style={{ gap: space.sm }}>
          <AppText variant="label">Kantong</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            {!initial && (
              <Chip
                label="Ikuti kategori"
                selected={pocketId === FOLLOW}
                onPress={() => setPocketId(FOLLOW)}
              />
            )}
            <Chip
              label="Tanpa kantong"
              selected={pocketId === null}
              onPress={() => {
                setPocketId(null);
                setPocketTouched(true);
              }}
            />
            {pockets.data.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                color={p.color}
                selected={pocketId === p.id}
                onPress={() => {
                  setPocketId(p.id);
                  setPocketTouched(true);
                }}
              />
            ))}
          </View>
        </View>
      )}

      <View style={{ gap: space.sm }}>
        <AppText variant="label">Metode bayar</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {PAYMENT_METHODS.map((m) => (
            <Chip
              key={m}
              label={PAYMENT_METHOD_LABELS[m]}
              selected={paymentMethod === m}
              onPress={() => setPaymentMethod(m)}
            />
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="label">Waktu (WIB)</AppText>
        <View style={{ flexDirection: 'row', gap: space.sm }}>
          <Button
            variant="secondary"
            title={formatDate(occurredAt)}
            icon={<Calendar color={theme.text} size={18} />}
            onPress={() => openPicker('date', occurredAt, setOccurredAt)}
            style={{ flex: 1 }}
          />
          <Button
            variant="secondary"
            title={formatTime(occurredAt)}
            icon={<Clock color={theme.text} size={18} />}
            onPress={() => openPicker('time', occurredAt, setOccurredAt)}
            style={{ flex: 1 }}
          />
        </View>
      </View>

      <TextField
        label="Catatan (opsional)"
        value={note}
        onChangeText={setNote}
        multiline
        style={{ minHeight: 72, textAlignVertical: 'top' }}
      />

      {error && <AppText tone="danger">{error}</AppText>}
      <Button title={submitLabel} onPress={submit} loading={pending} />
      {footer}
    </ScrollView>
  );
}
