import { StyleSheet, Text, View } from 'react-native';
import { colors, fontSize } from './theme';

export function Subtitles({ user, app }: { user: string; app: string }) {
  if (!user && !app) return null;
  return (
    <View style={styles.box}>
      {user ? (
        <Text style={styles.line}>
          <Text style={styles.who}>Vos: </Text>“{user}”
        </Text>
      ) : null}
      {app ? (
        <Text style={styles.line}>
          <Text style={styles.who}>App: </Text>
          {app}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { gap: 4 },
  line: { fontSize: fontSize.body, color: colors.text },
  who: { fontWeight: '800', color: colors.muted },
});
