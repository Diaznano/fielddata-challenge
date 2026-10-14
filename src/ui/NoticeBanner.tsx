import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Notice } from '@/voice/useVoiceAgent';
import { colors, fontSize } from './theme';

export function NoticeBanner({ notice }: { notice: Notice }) {
  return (
    <View style={styles.box} accessibilityLiveRegion="polite">
      <Text style={styles.text}>{notice.text}</Text>
      {notice.action ? (
        <Pressable onPress={notice.action.onPress} accessibilityRole="button" style={styles.button}>
          <Text style={styles.buttonText}>{notice.action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 2, borderColor: colors.pending, borderRadius: 12, padding: 12, gap: 8 },
  text: { fontSize: fontSize.body, color: colors.text },
  button: { alignSelf: 'flex-start', backgroundColor: colors.pendingText, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 },
  buttonText: { fontSize: fontSize.body, color: colors.white, fontWeight: '800' },
});
