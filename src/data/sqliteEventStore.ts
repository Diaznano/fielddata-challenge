import type { SQLiteDatabase } from 'expo-sqlite';
import { FarmEvent } from '@/domain/types';
import { EventStore } from './eventStore';

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY NOT NULL,
  type TEXT NOT NULL,
  payload TEXT NOT NULL,
  occurred_on TEXT NOT NULL,
  recorded_at TEXT NOT NULL,
  source TEXT NOT NULL,
  interpreter TEXT,
  raw_text TEXT
);
CREATE TABLE IF NOT EXISTS meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);
`;

interface EventRow {
  id: string;
  type: string;
  payload: string;
  occurred_on: string;
  recorded_at: string;
  source: string;
  interpreter: string | null;
  raw_text: string | null;
}

function toEvent(row: EventRow): FarmEvent {
  return {
    id: row.id,
    type: row.type,
    payload: JSON.parse(row.payload),
    occurredOn: row.occurred_on,
    recordedAt: row.recorded_at,
    source: row.source,
    interpreter: row.interpreter,
    rawText: row.raw_text,
  } as FarmEvent;
}

export class SqliteEventStore implements EventStore {
  constructor(private readonly db: SQLiteDatabase) {}

  async list(): Promise<FarmEvent[]> {
    const rows = await this.db.getAllAsync<EventRow>('SELECT * FROM events ORDER BY rowid');
    return rows.map(toEvent);
  }

  async append(events: FarmEvent[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      for (const e of events) await this.insert(e);
    });
  }

  async replaceAll(events: FarmEvent[]): Promise<void> {
    await this.db.withTransactionAsync(async () => {
      await this.db.runAsync('DELETE FROM events');
      for (const e of events) await this.insert(e);
    });
  }

  private async insert(e: FarmEvent): Promise<void> {
    await this.db.runAsync(
      'INSERT INTO events (id, type, payload, occurred_on, recorded_at, source, interpreter, raw_text) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      e.id,
      e.type,
      JSON.stringify(e.payload),
      e.occurredOn,
      e.recordedAt,
      e.source,
      e.interpreter,
      e.rawText,
    );
  }
}
