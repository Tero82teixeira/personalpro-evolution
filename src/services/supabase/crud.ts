import { requireSupabase } from './client';
import { isSupabaseConfigured } from './config';

export function createCrudService<T extends { id: string }>(table: string, local: () => T[], saveLocal: (items: T[]) => void) {
  return {
    async list() {
      if (!isSupabaseConfigured()) {
        return local();
      }
      const { data, error } = await requireSupabase().from(table).select('*');
      if (error) throw error;
      return (data ?? []) as T[];
    },
    async create(item: T) {
      if (!isSupabaseConfigured()) {
        saveLocal([...local(), item]);
        return item;
      }
      const { data, error } = await requireSupabase().from(table).insert(item).select().single();
      if (error) throw error;
      return (data ?? item) as T;
    },
    async update(id: string, patch: Partial<T>) {
      if (!isSupabaseConfigured()) {
        const next = local().map((item) => (item.id === id ? { ...item, ...patch } : item));
        saveLocal(next);
        return next.find((item) => item.id === id);
      }
      const { data, error } = await requireSupabase().from(table).update(patch as Record<string, unknown>).eq('id', id).select().single();
      if (error) throw error;
      return data as T;
    },
    async remove(id: string) {
      if (!isSupabaseConfigured()) {
        saveLocal(local().filter((item) => item.id !== id));
        return;
      }
      const { error } = await requireSupabase().from(table).delete().eq('id', id);
      if (error) throw error;
    }
  };
}
