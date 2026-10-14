import * as SQLite from 'expo-sqlite';
import { EventStore } from './eventStore';
import { buildSeedEvents, SEED_VERSION } from './seed';
import { SCHEMA, SqliteEventStore } from './sqliteEventStore';

export async function openFarmStore(today: string, nowIso: string, newId: () => string): Promise<EventStore> {
  const db = await SQLite.openDatabaseAsync('fielddata.db');
  await db.execAsync(SCHEMA);
  const store = new SqliteEventStore(db);
  const seeded = await db.getFirstAsync<{ value: string }>('SELECT value FROM meta WHERE key = ?', 'seed_version');
  if (!seeded) {
    await store.replaceAll(buildSeedEvents(today, newId, nowIso));
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'seed_version', SEED_VERSION);
    await db.runAsync('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)', 'installed_on', today);
  }
  return store;
}

export async function resetDemo(store: EventStore, today: string, nowIso: string, newId: () => string): Promise<void> {
  await store.replaceAll(buildSeedEvents(today, newId, nowIso));
}
