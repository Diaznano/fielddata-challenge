import * as Crypto from 'expo-crypto';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { LLM_ENABLED, OPENAI } from '@/config';
import { EventStore } from '@/data/eventStore';
import { openFarmStore } from '@/data/openStore';
import { FARM } from '@/data/seed';
import { toISODate } from '@/domain/dates';
import { createInterpreter } from '@/interpreter';
import { phraseWithLlm } from '@/interpreter/llm';
import { isOnline } from '@/platform/network';
import { HomeScreen } from '@/ui/HomeScreen';
import { colors, fontSize } from '@/ui/theme';
import { hasSeenWelcome } from '@/ui/welcome';
import { WelcomeScreen } from '@/ui/WelcomeScreen';

void SplashScreen.preventAutoHideAsync();

const llm = LLM_ENABLED ? OPENAI : null;
const interpret = createInterpreter({ llm, isOnline, farm: FARM, onLlmError: __DEV__ ? (e) => console.warn('LLM fallback', e) : undefined });
const phrase = llm ? (userText: string, result: Parameters<typeof phraseWithLlm>[1]) => phraseWithLlm(userText, result, llm) : undefined;

export default function App() {
  const [store, setStore] = useState<EventStore | null>(null);
  const [welcomeSeen, setWelcomeSeen] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const now = new Date();
    Promise.all([openFarmStore(toISODate(now), now.toISOString(), Crypto.randomUUID), hasSeenWelcome()])
      .then(([opened, seen]) => {
        setStore(opened);
        setWelcomeSeen(seen);
      })
      .catch((e: unknown) => setError(String(e)));
  }, []);

  const ready = store !== null && welcomeSeen !== null;

  useEffect(() => {
    if (ready || error) void SplashScreen.hideAsync();
  }, [ready, error]);

  return (
    <SafeAreaProvider>
      <StatusBar style={ready && welcomeSeen ? 'dark' : 'light'} />
      {ready ? (
        welcomeSeen ? (
          <HomeScreen store={store} interpret={interpret} phrase={phrase} />
        ) : (
          <WelcomeScreen onDone={() => setWelcomeSeen(true)} />
        )
      ) : (
        <View style={styles.loading}>
          {error ? <Text style={styles.error}>No pude abrir los datos: {error}</Text> : <ActivityIndicator size="large" color={colors.white} />}
        </View>
      )}
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.brand, padding: 24 },
  error: { fontSize: fontSize.body, color: colors.white, textAlign: 'center' },
});
