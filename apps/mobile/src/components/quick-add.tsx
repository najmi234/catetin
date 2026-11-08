import {
  PAYMENT_METHOD_LABELS,
  describeParseError,
  formatRupiah,
  parseExpenseText,
} from '@catetin/shared';
import { Send } from 'lucide-react-native';
import { useState } from 'react';
import { TextInput, View } from 'react-native';
import { useQuickAdd } from '@/lib/queries';
import { fontSize, radius, space, useTheme } from '@/theme';
import { AppText, Card, IconButton } from './ui';

/**
 * The same free-text format as the WhatsApp bot, one expense per line,
 * with a live preview of how each line will be read.
 */
export function QuickAdd() {
  const theme = useTheme();
  const [text, setText] = useState('');
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; text: string } | null>(
    null,
  );
  const quickAdd = useQuickAdd();

  const preview = text.trim() ? parseExpenseText(text) : [];
  const validCount = preview.filter((line) => line.ok).length;

  function submit() {
    if (validCount === 0 || quickAdd.isPending) return;
    quickAdd.mutate(text, {
      onSuccess: (result) => {
        // Keep only the lines that failed, so they can be fixed and resent
        setText(result.failed.map((f) => f.line).join('\n'));
        const notes = [`${result.created.length} tercatat`];
        if (result.unknownTags.length > 0) {
          notes.push(
            `kategori ${result.unknownTags.map((t) => `#${t}`).join(', ')} tidak ditemukan`,
          );
        }
        setFeedback({
          tone: result.unknownTags.length > 0 || result.failed.length > 0 ? 'warning' : 'success',
          text: notes.join(' · '),
        });
      },
      onError: (error) => setFeedback({ tone: 'warning', text: error.message }),
    });
  }

  return (
    <Card style={{ gap: space.sm }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: space.sm }}>
        <TextInput
          value={text}
          onChangeText={(value) => {
            setText(value);
            setFeedback(null);
          }}
          placeholder="Catat cepat: kopi 15k #makan $jajan"
          placeholderTextColor={theme.textMuted}
          multiline
          autoCapitalize="none"
          autoCorrect={false}
          accessibilityLabel="Catat cepat"
          style={{
            flex: 1,
            minHeight: 44,
            maxHeight: 120,
            paddingHorizontal: space.md,
            paddingVertical: space.sm,
            borderRadius: radius.md,
            backgroundColor: theme.surfaceMuted,
            color: theme.text,
            fontSize: fontSize.body,
          }}
        />
        <IconButton
          label="Simpan catatan"
          filled
          disabled={validCount === 0 || quickAdd.isPending}
          onPress={submit}
        >
          <Send color={theme.onPrimary} size={20} />
        </IconButton>
      </View>

      {preview.map((line, i) => (
        <AppText key={i} variant="caption" tone={line.ok ? 'muted' : 'danger'} numberOfLines={2}>
          {line.ok
            ? `✓ ${line.expense.merchant} · ${formatRupiah(line.expense.amount)}` +
              (line.expense.categoryTag ? ` · #${line.expense.categoryTag}` : '') +
              (line.expense.pocketTag ? ` · $${line.expense.pocketTag}` : '') +
              (line.expense.paymentMethod
                ? ` · ${PAYMENT_METHOD_LABELS[line.expense.paymentMethod]}`
                : '')
            : `⚠ "${line.line}": ${describeParseError(line.error)}`}
        </AppText>
      ))}

      {feedback && (
        <AppText variant="caption" tone={feedback.tone}>
          {feedback.text}
        </AppText>
      )}
    </Card>
  );
}
