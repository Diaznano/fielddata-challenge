import { StyleSheet, Text, View } from 'react-native';
import { describeDay } from '@/domain/dates';
import { formatMm } from '@/domain/rain';
import { TodaySummary } from '@/domain/summary';
import { colors, fontSize } from './theme';

export function TodaySummaryView({ summary, today }: { summary: TodaySummary; today: string }) {
  const last = summary.lastRain
    ? `Última lluvia: ${describeDay(summary.lastRain.date, today)} (${formatMm(summary.lastRain.mm)} mm)`
    : 'Sin lluvias registradas';
  const moves = summary.movesToday === 1 ? '1 movimiento hoy' : `${summary.movesToday} movimientos hoy`;
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>HOY</Text>
      <Text style={styles.line}>🌧  {formatMm(summary.rainTodayMm)} mm hoy · {formatMm(summary.rainMonthMm)} mm en {summary.month}</Text>
      <Text style={styles.sub}>{last}</Text>
      <Text style={styles.line}>🐄  {summary.totalHeads} cabezas en {summary.lotCount} lotes</Text>
      <Text style={styles.line}>↔  {moves}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4, paddingVertical: 12, borderTopWidth: 1, borderBottomWidth: 1, borderColor: colors.border },
  heading: { fontSize: fontSize.body, fontWeight: '800', color: colors.brand, letterSpacing: 1 },
  line: { fontSize: fontSize.body, color: colors.text, fontWeight: '600' },
  sub: { fontSize: fontSize.body, color: colors.muted, marginLeft: 32 },
});
