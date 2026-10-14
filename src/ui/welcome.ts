import Storage from 'expo-sqlite/kv-store';

const KEY = 'welcome_seen_v1';

export async function hasSeenWelcome(): Promise<boolean> {
  return (await Storage.getItem(KEY)) === '1';
}

export async function markWelcomeSeen(): Promise<void> {
  await Storage.setItem(KEY, '1');
}
