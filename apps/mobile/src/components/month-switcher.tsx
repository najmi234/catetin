import { currentYearMonth, formatMonthLabel, shiftYearMonth } from '@catetin/shared';
import { ChevronLeft, ChevronRight } from 'lucide-react-native';
import { View } from 'react-native';
import { useTheme } from '@/theme';
import { AppText, IconButton } from './ui';

export function MonthSwitcher({
  month,
  onChange,
}: {
  month: string;
  onChange: (month: string) => void;
}) {
  const theme = useTheme();
  const isCurrent = month >= currentYearMonth();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <IconButton label="Bulan sebelumnya" onPress={() => onChange(shiftYearMonth(month, -1))}>
        <ChevronLeft color={theme.text} size={22} />
      </IconButton>
      <AppText variant="label" style={{ minWidth: 120, textAlign: 'center' }}>
        {formatMonthLabel(month)}
      </AppText>
      <IconButton
        label="Bulan berikutnya"
        disabled={isCurrent}
        onPress={() => onChange(shiftYearMonth(month, 1))}
      >
        <ChevronRight color={theme.text} size={22} />
      </IconButton>
    </View>
  );
}
