import { seedData } from '../data/seed';
import type { AppData } from '../types';
import { requireSupabase } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';

const DATA_KEY = 'personalpro:data';
const SESSION_KEY = 'personalpro:session';

export function loadData(): AppData {
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) {
    saveData(seedData);
    return seedData;
  }
  const parsed = JSON.parse(stored) as Partial<AppData>;
  return { ...seedData, ...parsed, workoutLogs: parsed.workoutLogs ?? [] } as AppData;
}

export function saveData(data: AppData) {
  localStorage.setItem(DATA_KEY, JSON.stringify(data));
}

export function loadSession(): string | null {
  return localStorage.getItem(SESSION_KEY);
}

export function saveSession(userId: string) {
  localStorage.setItem(SESSION_KEY, userId);
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

export function makeId(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

export async function uploadImage(bucket: 'avatars' | 'progress-photos', file: File, ownerId: string) {
  if (!isSupabaseConfigured()) {
    return URL.createObjectURL(file);
  }
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${ownerId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await requireSupabase().storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = requireSupabase().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
