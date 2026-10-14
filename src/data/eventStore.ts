import { FarmEvent } from '@/domain/types';

export interface EventStore {
  list(): Promise<FarmEvent[]>;
  append(events: FarmEvent[]): Promise<void>;
  replaceAll(events: FarmEvent[]): Promise<void>;
}

export class MemoryEventStore implements EventStore {
  private events: FarmEvent[];

  constructor(initial: FarmEvent[] = []) {
    this.events = [...initial];
  }

  async list(): Promise<FarmEvent[]> {
    return [...this.events];
  }

  async append(events: FarmEvent[]): Promise<void> {
    this.events.push(...events);
  }

  async replaceAll(events: FarmEvent[]): Promise<void> {
    this.events = [...events];
  }
}
