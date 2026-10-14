import { Pressable, StyleSheet, Text, View } from 'react-native';
import { formatTime } from '@/domain/dates';
import { Card, CardTone } from '@/tools/cards';
import { colors, fontSize, toneColor, toneText } from './theme';

const ICON: Record<CardTone, string> = { registro: '✓', consulta: '◉', pendiente: '✎', ayuda: '💬', rechazo: '⚠' };

export function ReceiptCard({ card, compact, disabled, onUndo }: { card: Card; compact: boolean; disabled: boolean; onUndo: () => void }) {
  return (
    <View style={[styles.card, compact && compactStyles.card, { borderColor: toneColor[card.tone] }]} accessibilityLiveRegion="polite">
      <Text style={[styles.title, compact && compactStyles.title, { color: toneText[card.tone] }]}>
        {ICON[card.tone]}  {card.title.toUpperCase()}
      </Text>
      {card.headline ? <Text style={[styles.headline, compact && compactStyles.headline]}>{card.headline}</Text> : null}
      {card.fields?.map((f) => (
        <View key={f.label} style={styles.field}>
          <Text style={[styles.fieldLabel, compact && compactStyles.text]}>{f.label}</Text>
          <Text style={[styles.fieldValue, compact && compactStyles.text, f.value === null && styles.missing]}>{f.value ?? '¿?'}</Text>
        </View>
      ))}
      {card.lines.map((line, i) => (
        <Text key={i} style={[styles.line, compact && compactStyles.text]}>
          {line}
        </Text>
      ))}
      {card.undoableEventId ? (
        <View style={[styles.footer, compact && compactStyles.footer]}>
          <Text style={[styles.time, compact && compactStyles.text]}>{card.at ? formatTime(card.at) : ''}</Text>
          <Pressable
            onPress={onUndo}
            disabled={disabled}
            hitSlop={16}
            accessibilityRole="button"
            accessibilityLabel="Deshacer"
            accessibilityState={{ disabled }}
            style={[styles.undo, compact && compactStyles.undo, disabled && styles.undoDisabled]}
          >
            <Text style={[styles.undoText, compact && compactStyles.text]}>DESHACER</Text>
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

// En 360x640 dp la tarjeta tiene que entrar entera entre el encabezado y el campo de texto sin scrollear.
const compactStyles = StyleSheet.create({
  card: { padding: 12, gap: 4 },
  title: { fontSize: fontSize.badge },
  headline: { fontSize: 32 },
  text: { fontSize: 18 },
  footer: { marginTop: 4 },
  undo: { paddingVertical: 6 },
});
