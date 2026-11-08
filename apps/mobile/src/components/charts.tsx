import { daysInMonth, formatRupiah, parseYearMonth } from '@catetin/shared';
import { useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { BarChart, PieChart } from 'react-native-gifted-charts';
import type { MonthSummary } from '@/lib/api';
import { compactRupiah } from '@/lib/format';
import { space, useTheme } from '@/theme';
import { CategoryIcon } from './category-icon';
import { AppText } from './ui';

/** One bar per day of the month, scrollable sideways. Tap a bar to see its total. */
export function DailyChart({ summary }: { summary: MonthSummary }) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const [selected, setSelected] = useState<number | null>(null);

  const ym = parseYearMonth(summary.month)!;
  const totals = new Map(summary.daily.map((d) => [d.day, d.total]));
  const data = Array.from({ length: daysInMonth(ym.year, ym.month) }, (_, i) => {
    const day = i + 1;
    return {
      value: totals.get(day) ?? 0,
      label: day === 1 || day % 5 === 0 ? String(day) : '',
      frontColor: day === selected ? theme.primary : `${theme.primary}99`,
      onPress: () => setSelected((current) => (current === day ? null : day)),
    };
  });

  return (
    <View style={{ gap: space.sm }}>
      <AppText variant="small" tone="muted">
        {selected
          ? `Tanggal ${selected}: ${formatRupiah(totals.get(selected) ?? 0)}`
          : 'Ketuk batang untuk melihat total harian'}
      </AppText>
      <BarChart
        data={data}
        // Card padding (2 × 16) + screen padding (2 × 16) + y-axis labels
        width={width - 64 - 44}
        height={160}
        barWidth={8}
        spacing={6}
        initialSpacing={4}
        endSpacing={4}
        roundedTop
        noOfSections={3}
        yAxisLabelWidth={40}
        formatYLabel={(label) => compactRupiah(Number(label))}
        yAxisThickness={0}
        xAxisThickness={1}
        xAxisColor={theme.border}
        rulesColor={theme.border}
        rulesType="solid"
        yAxisTextStyle={{ color: theme.textMuted, fontSize: 10 }}
        xAxisLabelTextStyle={{ color: theme.textMuted, fontSize: 10, width: 20 }}
        isAnimated
      />
    </View>
  );
}

/** Donut of spending per category, with a legend listing amount and share. */
export function CategoryBreakdown({ summary }: { summary: MonthSummary }) {
  const theme = useTheme();
  const data = summary.byCategory.map((c) => ({ value: c.total, color: c.color }));

  return (
    <View style={{ gap: space.lg }}>
      <View style={{ alignItems: 'center' }}>
        <PieChart
          data={data}
          donut
          radius={80}
          innerRadius={56}
          innerCircleColor={theme.surface}
          centerLabelComponent={() => (
            <View style={{ alignItems: 'center' }}>
              <AppText variant="caption" tone="muted">
                Total
              </AppText>
              <AppText variant="label">{compactRupiah(summary.total)}</AppText>
            </View>
          )}
        />
      </View>
      <View style={{ gap: space.sm }}>
        {summary.byCategory.map((c) => {
          const share = summary.total > 0 ? Math.round((c.total / summary.total) * 100) : 0;
          return (
            <View
              key={c.categoryId ?? 'none'}
              style={{ flexDirection: 'row', alignItems: 'center', gap: space.md }}
            >
              <CategoryIcon icon={c.categoryId ? c.icon : null} color={c.color} size={30} />
              <View style={{ flex: 1 }}>
                <AppText numberOfLines={1} style={{ fontWeight: '600' }}>
                  {c.name}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {c.count} transaksi · {share}%
                </AppText>
              </View>
              <AppText style={{ fontWeight: '600', fontVariant: ['tabular-nums'] }}>
                {formatRupiah(c.total)}
              </AppText>
            </View>
          );
        })}
      </View>
    </View>
  );
}
