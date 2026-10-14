import { StyleSheet, Text, View } from 'react-native';
import { Mode } from '@/conversation/mode';
import { fontSize, modeMeta } from './theme';

export function StatusBadge({ mode }: { mode: Mode }) {
  const meta = modeMeta[mode];
  return (
    <View style={[styles.badge, { borderColor: meta.color }]} accessibilityLabel={`Modo ${meta.label}`}>
      <View style={[styles.dot, { backgroundColor: meta.color }]} />
      <Text style={[styles.label, { color: meta.color }]}>{meta.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 2, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  dot: { width: 10, height: 10, borderRadius: 5 },
  label: { fontSize: fontSize.badge, fontWeight: '800', letterSpacing: 0.5 },
});
