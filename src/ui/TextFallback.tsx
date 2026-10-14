import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { colors, fontSize } from './theme';

export function TextFallback({ expanded, disabled, onSubmit }: { expanded: boolean; disabled: boolean; onSubmit: (text: string) => void }) {
  const [open, setOpen] = useState(expanded);
  const [value, setValue] = useState('');

  useEffect(() => {
    if (expanded) setOpen(true);
  }, [expanded]);

  const send = () => {
    const text = value.trim();
    if (!text) return;
    onSubmit(text);
    setValue('');
  };

  if (!open) {
    return (
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" style={styles.toggle}>
        <Text style={styles.toggleText}>⌨  Escribir en vez de hablar</Text>
      </Pressable>
    );
  }
  return (
    <View style={styles.row}>
      <TextInput
        accessibilityLabel="Campo de texto"
        value={value}
        onChangeText={setValue}
        onSubmitEditing={send}
        placeholder="Ej: llovieron 18 mm anoche"
        placeholderTextColor={colors.muted}
        returnKeyType="send"
        editable={!disabled}
        style={styles.input}
      />
      <Pressable accessibilityLabel="Enviar" accessibilityRole="button" onPress={send} disabled={disabled} style={styles.send}>
        <Text style={styles.sendText}>Enviar</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { paddingHorizontal: 16, paddingVertical: 10 },
  toggleText: { fontSize: fontSize.body, color: colors.brand, fontWeight: '700' },
  row: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 8 },
  input: { flex: 1, fontSize: fontSize.body, color: colors.text, borderWidth: 2, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10 },
  send: { backgroundColor: colors.brand, borderRadius: 12, paddingHorizontal: 16, justifyContent: 'center' },
  sendText: { fontSize: fontSize.body, color: colors.white, fontWeight: '800' },
});
