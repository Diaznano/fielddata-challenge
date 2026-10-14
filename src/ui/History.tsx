import { StyleSheet, Text, View } from 'react-native';
import { TodayRecord } from '@/domain/summary';
import { colors, fontSize } from './theme';

export function History({ records }: { records: TodayRecord[] }) {
  return (
    <View style={styles.box}>
      <Text style={styles.heading}>HISTORIAL DE HOY</Text>
      {records.map((r, i) => (
        <Text key={i} style={styles.line}>
          {r.time} · {r.text}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  heading: { fontSize: fontSize.body, fontWeight: '800', color: colors.muted, letterSpacing: 1 },
  line: { fontSize: fontSize.body, color: colors.text },
});
