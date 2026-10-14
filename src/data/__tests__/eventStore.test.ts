import { rain } from '@/test-utils/events';
import { MemoryEventStore } from '../eventStore';

describe('MemoryEventStore', () => {
  it('agrega en orden y reemplaza todo', async () => {
    const store = new MemoryEventStore([rain('a', '2026-10-01', 1)]);
    await store.append([rain('b', '2026-10-02', 2), rain('c', '2026-10-03', 3)]);
    expect((await store.list()).map((e) => e.id)).toEqual(['a', 'b', 'c']);
    await store.replaceAll([rain('z', '2026-10-04', 4)]);
    expect((await store.list()).map((e) => e.id)).toEqual(['z']);
  });

  it('list devuelve una copia', async () => {
    const store = new MemoryEventStore();
    const list = await store.list();
    list.push(rain('x', '2026-10-01', 1));
    expect(await store.list()).toEqual([]);
  });
});
