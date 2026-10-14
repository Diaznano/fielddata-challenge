import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text } from 'react-native';
import { MIC_COPY, MicStatus } from '@/conversation/mic';
import { colors, fontSize, micColor } from './theme';

const ICONS = {
  idle: 'microphone',
  listening: 'microphone',
  thinking: 'microphone',
  speaking: 'volume-high',
  blocked: 'microphone-off',
} as const;

export function MicButton({ status, compact, onPress }: { status: MicStatus; compact: boolean; onPress: () => void }) {
  const pulse = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    if (status !== 'listening') {
      pulse.setValue(1);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.55, duration: 600, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 1, duration: 600, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [status, pulse]);

  const copy = MIC_COPY[status];
  return (
    <Pressable onPress={onPress} disabled={status === 'thinking'} accessibilityRole="button" accessibilityLabel={copy.label} style={compact ? styles.wrapCompact : styles.wrap}>
      <Animated.View style={[styles.button, compact && styles.buttonCompact, { backgroundColor: micColor[status], opacity: pulse }]}>
        {status === 'thinking' ? (
          <ActivityIndicator color={colors.white} size="large" />
        ) : (
          <MaterialCommunityIcons name={ICONS[status]} size={compact ? 56 : 72} color={colors.white} />
        )}
        <Text style={styles.label}>{copy.label}</Text>
        <Text style={styles.hint}>{copy.hint}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { height: '30%', minHeight: 200, flexShrink: 0, padding: 12 },
  wrapCompact: { height: '24%', minHeight: 150, flexShrink: 0, padding: 8 },
  button: { flex: 1, borderRadius: 28, alignItems: 'center', justifyContent: 'center', gap: 8 },
  buttonCompact: { gap: 2 },
  label: { fontSize: fontSize.title, fontWeight: '900', color: colors.white },
  hint: { fontSize: fontSize.body, color: colors.white },
});
