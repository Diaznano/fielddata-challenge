import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { requestMic } from '@/voice/stt';
import { colors, fontSize } from './theme';
import { useCompact } from './useCompact';
import { markWelcomeSeen } from './welcome';

const EXAMPLES = ['Llovieron 18 mm anoche', 'Pasé 40 vaquillonas del lote 3 al 5', '¿Cuántos animales hay en el lote 5?'];

export function WelcomeScreen({ onDone }: { onDone: () => void }) {
  const insets = useSafeAreaInsets();
  const compact = useCompact();
  const [busy, setBusy] = useState(false);

  const start = async () => {
    setBusy(true);
    // Sin permiso o sin poder guardar la marca igual se entra: la app ofrece escribir y la bienvenida vuelve a salir la próxima vez.
    try {
      await requestMic();
      await markWelcomeSeen();
    } finally {
      onDone();
    }
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.top, !compact && roomy.top, { paddingTop: insets.top + (compact ? 8 : 24) }]}>
        <Image source={require('../../assets/fielddata-isotipo.png')} style={[styles.mark, !compact && roomy.mark]} />
        <Text style={[styles.title, !compact && roomy.title]}>FieldData</Text>
        <Text style={[styles.tagline, !compact && roomy.tagline]}>Decile lo que pasó en el campo. Lo anota y te deja el comprobante.</Text>
      </View>
      <View style={styles.body}>
        <View style={[styles.inner, !compact && roomy.inner]}>
          <Text style={styles.label}>Probá con:</Text>
          {EXAMPLES.map((phrase) => (
            <View key={phrase} style={[styles.example, !compact && roomy.example]}>
              <MaterialCommunityIcons name="microphone" size={compact ? 22 : 28} color={colors.brand} />
              <Text style={[styles.exampleText, !compact && roomy.exampleText]}>«{phrase}»</Text>
            </View>
          ))}
          <Text style={[styles.hint, !compact && roomy.hint]}>Para escucharte usa el micrófono. Si preferís, también podés escribir.</Text>
          <Pressable onPress={start} disabled={busy} accessibilityRole="button" style={[styles.button, busy && styles.buttonBusy]}>
            <Text style={styles.buttonText}>Empezar</Text>
          </Pressable>
        </View>
      </View>
      <View style={[styles.footer, { paddingBottom: insets.bottom + 8 }]}>
        <Image source={require('../../assets/fielddata-logo.png')} style={styles.logo} />
        <Text style={styles.legend}>Challenge técnico para FieldData</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { backgroundColor: colors.brand, alignItems: 'center', paddingHorizontal: 20, paddingBottom: 12, gap: 4 },
  mark: { width: 64, height: 64, marginBottom: 4 },
  title: { fontSize: 32, fontWeight: '900', color: colors.white },
  tagline: { fontSize: 17, color: colors.white, textAlign: 'center', maxWidth: 520 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 },
  inner: { width: '100%', maxWidth: 520, alignSelf: 'center', gap: 6 },
  label: { fontSize: fontSize.badge, fontWeight: '700', color: colors.muted },
  example: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.cardBg, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 10, paddingVertical: 6 },
  exampleText: { flex: 1, fontSize: 16, color: colors.text },
  hint: { fontSize: 15, color: colors.muted, marginVertical: 4 },
  button: { minHeight: 64, borderRadius: 28, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
  buttonBusy: { opacity: 0.6 },
  buttonText: { fontSize: fontSize.title, fontWeight: '900', color: colors.white },
  footer: { backgroundColor: colors.text, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, paddingTop: 8, paddingHorizontal: 16 },
  logo: { width: 110, height: 26 },
  legend: { fontSize: 12, color: colors.white, flexShrink: 1 },
});

// En pantallas altas (tablet) sobra lugar: se usan los tamaños de texto del resto de la app.
const roomy = StyleSheet.create({
  top: { paddingBottom: 28, gap: 8 },
  mark: { width: 96, height: 96, marginBottom: 8 },
  title: { fontSize: 40 },
  tagline: { fontSize: fontSize.body },
  inner: { gap: 12 },
  example: { paddingVertical: 12, paddingHorizontal: 14, gap: 12 },
  exampleText: { fontSize: fontSize.body },
  hint: { fontSize: 17, marginVertical: 8 },
});
