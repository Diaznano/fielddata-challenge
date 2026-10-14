import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '@/domain/dates';
import { Card, CardTone } from '@/tools/cards';
import { colors, fontSize, toneColor, toneText } from './theme';

const ICON: Record<CardTone, string> = { registro: '✓', consulta: '◉', pendiente: '✎', ayuda: '💬', rechazo: '⚠' };

export function ReceiptCard({ card, disabled, onUndo }: { card: Card; disabled: boolean; onUndo: () => void }) {
  return (
    <View style={[styles.card, { borderColor: toneColor[card.tone] }]} accessibilityLiveRegion="polite">
      <Text style={[styles.title, { color: toneText[card.tone] }]}>
        {ICON[card.tone]}  {card.title.toUpperCase()}
      </Text>
      {card.headline ? <Text style={styles.headline}>{card.headline}</Text> : null}
      {card.fields?.map((f) => (
        <View key={f.label} style={styles.field}>
          <Text style={styles.fieldLabel}>{f.label}</Text>
          <Text style={[styles.fieldValue, f.value === null && styles.missing]}>{f.value ?? '¿?'}</Text>
        </View>
      ))}
      {card.lines.map((line, i) => (
        <Text key={i} style={styles.line}>
          {line}
        </Text>
      ))}
      {card.undoableEventId ? (
        <View style={styles.footer}>
          <Text style={styles.time}>{card.at ? formatTime(card.at) : ''}</Text>
          <Pressable
            onPress={onUndo}
            disabled={disabled}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Deshacer"
            accessibilityState={{ disabled }}
            style={[styles.undo, disabled && styles.undoDisabled]}
          >
            <Text style={styles.undoText}>DESHACER</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.cardBg, borderWidth: 3, borderRadius: 16, padding: 16, gap: 6 },
  title: { fontSize: fontSize.body, fontWeight: '800', letterSpacing: 0.5 },
  headline: { fontSize: fontSize.number, fontWeight: '800', color: colors.text },
  field: { flexDirection: 'row', justifyContent: 'space-between' },
  fieldLabel: { fontSize: fontSize.body, color: colors.muted },
  fieldValue: { fontSize: fontSize.body, color: colors.text, fontWeight: '700' },
  missing: { color: colors.pendingText, fontWeight: '900' },
  line: { fontSize: fontSize.body, color: colors.text },
  footer: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 },
  time: { fontSize: fontSize.body, color: colors.muted },
  undo: { borderWidth: 2, borderColor: colors.text, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
  undoDisabled: { opacity: 0.35 },
  undoText: { fontSize: fontSize.body, fontWeight: '800', color: colors.text },
});
