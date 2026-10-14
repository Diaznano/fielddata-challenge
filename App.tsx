import * as Crypto from 'expo-crypto';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { EventStore } from '@/data/eventStore';
import { openFarmStore } from '@/data/openStore';
import { toISODate } from '@/domain/dates';
import { interpretLocally } from '@/interpreter';
import { HomeScreen } from '@/ui/HomeScreen';
import { colors, fontSize } from '@/ui/theme';

export default function App() {
  const [store, setStore] = useState<EventStore | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    openFarmStore(toISODate(now), now.toISOString(), Crypto.randomUUID)
      .then(setStore)
      .catch((e: unknown) => setError(String(e)));
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {store ? (
        <HomeScreen store={store} interpret={interpretLocally} />
      ) : (
        <View style={styles.splash}>
          {error ? <Text style={styles.error}>No pude abrir los datos: {error}</Text> : <ActivityIndicator size="large" color={colors.brand} />}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  splash: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  error: { fontSize: fontSize.body, color: colors.danger, textAlign: 'center' },
});
