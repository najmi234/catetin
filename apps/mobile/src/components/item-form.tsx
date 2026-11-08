import { Check } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, View } from 'react-native';
import { usePockets } from '@/lib/queries';
import { radius, space, useTheme } from '@/theme';
import { CATEGORY_COLORS, CATEGORY_ICONS, CategoryIcon } from './category-icon';
import { AppText, Button, Chip, TextField } from './ui';

export interface ItemFormValues {
  name: string;
  color: string;
  icon: string;
  /** Only sent when the form shows the pocket picker (categories). */
  pocketId?: string | null;
}

/** Name, colour and icon — shared by categories and pockets. */
export function ItemForm({
  initial,
  newLabel,
  namePlaceholder,
  defaultIcon,
  defaultColor = CATEGORY_COLORS[4]!,
  showPocketPicker = false,
  submitLabel,
  pending,
  error,
  onSubmit,
  footer,
}: {
  initial?: { name: string; color: string; icon: string; pocketId?: string | null };
  newLabel: string;
  namePlaceholder: string;
  defaultIcon: string;
  defaultColor?: string;
  showPocketPicker?: boolean;
  submitLabel: string;
  pending: boolean;
  error?: string | null;
  onSubmit: (values: ItemFormValues) => void;
  footer?: ReactNode;
}) {
  const theme = useTheme();
  const pockets = usePockets();
  const [name, setName] = useState(initial?.name ?? '');
  const [color, setColor] = useState(initial?.color ?? defaultColor);
  const [icon, setIcon] = useState(initial?.icon ?? defaultIcon);
  const [pocketId, setPocketId] = useState<string | null>(initial?.pocketId ?? null);
  const [touched, setTouched] = useState(false);

  function submit() {
    setTouched(true);
    if (!name.trim()) return;
    onSubmit({
      name: name.trim(),
      color,
      icon,
      ...(showPocketPicker && { pocketId }),
    });
  }

  return (
    <ScrollView
      contentContainerStyle={{ padding: space.lg, gap: space.lg }}
      keyboardShouldPersistTaps="handled"
    >
      <View style={{ alignItems: 'center', gap: space.sm }}>
        <CategoryIcon icon={icon} color={color} size={64} />
        <AppText variant="heading">{name.trim() || newLabel}</AppText>
      </View>

      <TextField
        label="Nama"
        value={name}
        onChangeText={setName}
        placeholder={namePlaceholder}
        maxLength={50}
        error={touched && !name.trim() ? 'Nama wajib diisi' : null}
        autoFocus={!initial}
      />

      {showPocketPicker && (
        <View style={{ gap: space.sm }}>
          <AppText variant="label">Ambil dari kantong</AppText>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
            <Chip
              label="Tanpa kantong"
              selected={pocketId === null}
              onPress={() => setPocketId(null)}
            />
            {pockets.data?.map((p) => (
              <Chip
                key={p.id}
                label={p.name}
                color={p.color}
                selected={pocketId === p.id}
                onPress={() => setPocketId(p.id)}
              />
            ))}
          </View>
          <AppText variant="caption" tone="muted">
            Pengeluaran di kategori ini otomatis mengurangi saldo kantong tersebut.
          </AppText>
        </View>
      )}

      <View style={{ gap: space.sm }}>
        <AppText variant="label">Warna</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {CATEGORY_COLORS.map((c) => (
            <Pressable
              key={c}
              accessibilityRole="button"
              accessibilityLabel={`Warna ${c}`}
              accessibilityState={{ selected: color === c }}
              onPress={() => setColor(c)}
              style={{
                width: 40,
                height: 40,
                borderRadius: 20,
                backgroundColor: c,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 2,
                borderColor: color === c ? theme.text : 'transparent',
              }}
            >
              {color === c && <Check color="#FFFFFF" size={18} />}
            </Pressable>
          ))}
        </View>
      </View>

      <View style={{ gap: space.sm }}>
        <AppText variant="label">Ikon</AppText>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
          {Object.entries(CATEGORY_ICONS).map(([key, Icon]) => (
            <Pressable
              key={key}
              accessibilityRole="button"
              accessibilityLabel={`Ikon ${key}`}
              accessibilityState={{ selected: icon === key }}
              onPress={() => setIcon(key)}
              style={{
                width: 48,
                height: 48,
                borderRadius: radius.md,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: 1,
                borderColor: icon === key ? color : theme.border,
                backgroundColor: icon === key ? `${color}22` : theme.surface,
              }}
            >
              <Icon color={icon === key ? color : theme.textMuted} size={22} />
            </Pressable>
          ))}
        </View>
      </View>

      {error && <AppText tone="danger">{error}</AppText>}
      <Button title={submitLabel} onPress={submit} loading={pending} />
      {footer}
    </ScrollView>
  );
}
