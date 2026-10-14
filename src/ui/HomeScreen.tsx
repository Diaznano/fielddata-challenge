import { useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { TurnDeps } from '@/conversation/engine';
import { EventStore } from '@/data/eventStore';
import { FARM } from '@/data/seed';
import { formatLongDate, toISODate } from '@/domain/dates';
import { TodaySummary, todaySummary } from '@/domain/summary';
import { capitalize } from '@/tools/format';
import { useVoiceAgent } from '@/voice/useVoiceAgent';
import { useVolumePtt } from '@/voice/useVolumePtt';
import { History } from './History';
import { MicButton } from './MicButton';
import { NoticeBanner } from './NoticeBanner';
import { ReceiptCard } from './ReceiptCard';
import { StatusBadge } from './StatusBadge';
import { Subtitles } from './Subtitles';
import { TextFallback } from './TextFallback';
import { colors, fontSize } from './theme';
import { TodaySummaryView } from './TodaySummaryView';

interface Props {
  store: EventStore;
  interpret: TurnDeps['interpret'];
  phrase?: TurnDeps['phrase'];
}

export function HomeScreen({ store, interpret, phrase }: Props) {
  const agent = useVoiceAgent({ store, farm: FARM, interpret, phrase });
  useVolumePtt(agent.onMicPress);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const today = toISODate(new Date());
  const thinking = agent.mic.status === 'thinking';

  useEffect(() => {
    void store.list().then((events) => setSummary(todaySummary(FARM, events, today)));
  }, [store, agent.version, today]);

  const confirmReset = () =>
    Alert.alert('Restaurar datos de demo', 'Se borran tus registros y vuelve la semilla original.', [
      { text: 'Cancelar', style: 'cancel' },
      { text: 'Restaurar', style: 'destructive', onPress: () => void agent.resetDemo() },
    ]);

  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <Pressable onLongPress={thinking ? undefined : confirmReset} delayLongPress={800}>
            <Text style={styles.farm}>{FARM.name}</Text>
          </Pressable>
          <StatusBadge mode={agent.mode} />
        </View>
        <Text style={styles.date}>{capitalize(formatLongDate(today))}</Text>
        {summary ? <TodaySummaryView summary={summary} today={today} /> : null}
        {agent.notice ? <NoticeBanner notice={agent.notice} /> : null}
        {agent.card ? <ReceiptCard card={agent.card} disabled={thinking} onUndo={agent.undoLast} /> : null}
        <Subtitles user={agent.partial || agent.lastUser} app={agent.lastReply} />
        {summary && summary.records.length > 0 ? <History records={summary.records} /> : null}
      </ScrollView>
      <TextFallback expanded={agent.mic.status === 'blocked' || agent.notice !== null} disabled={thinking} onSubmit={agent.submitText} />
      <MicButton status={agent.mic.status} onPress={agent.onMicPress} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  farm: { fontSize: fontSize.title, fontWeight: '900', color: colors.brand },
  date: { fontSize: fontSize.body, color: colors.muted },
});
