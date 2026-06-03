import { seedData } from '../data/seed';
import { defaultPersonalSettings } from '../data/defaultSettings';
import type { AppData, PersonalSettings } from '../types';
import { requireSupabase } from './supabase/client';
import { isSupabaseConfigured } from './supabase/config';

const DATA_KEY = 'personalpro:data';
const SESSION_KEY = 'personalpro:session';
const SETTINGS_KEY = 'personalpro-personal-settings';
const LEGACY_SETTINGS_KEY = 'personalpro:settings';

export { defaultPersonalSettings };

export function loadPersonalSettings(): PersonalSettings {
  try {
    const stored = localStorage.getItem(SETTINGS_KEY) ?? localStorage.getItem(LEGACY_SETTINGS_KEY);
    if (!stored) return defaultPersonalSettings;
    const parsed = JSON.parse(stored) as Partial<PersonalSettings>;
    const whatsappMessage = parsed.whatsappMessage ?? parsed.whatsappMessageTemplate ?? defaultPersonalSettings.whatsappMessage;
    return {
      ...defaultPersonalSettings,
      ...parsed,
      whatsappMessage,
      whatsappMessageTemplate: parsed.whatsappMessageTemplate ?? whatsappMessage
    } as PersonalSettings;
  } catch {
    return defaultPersonalSettings;
  }
}

export function savePersonalSettings(settings: PersonalSettings) {
  const nextSettings = {
    ...defaultPersonalSettings,
    ...settings,
    whatsappMessageTemplate: settings.whatsappMessageTemplate || settings.whatsappMessage
  };
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(nextSettings));
}

export function loadData(): AppData {
  const stored = localStorage.getItem(DATA_KEY);
  if (!stored) {
    saveData(seedData);
    return { ...seedData, personalSettings: loadPersonalSettings() };
  }
  const parsed = JSON.parse(stored) as Partial<AppData>;
  return { ...seedData, ...parsed, workoutLogs: parsed.workoutLogs ?? [], personalSettings: parsed.personalSettings ?? loadPersonalSettings() } as AppData;
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

export function makeSafeId(prefix = 'id') {
  const randomUuid =
    typeof globalThis.crypto !== 'undefined' ? globalThis.crypto.randomUUID : undefined;

  if (typeof randomUuid === 'function') {
    return randomUuid.call(globalThis.crypto);
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

export function makeId(prefix: string) {
  return `${prefix}-${makeSafeId(prefix)}`;
}

export async function uploadImage(bucket: 'avatars' | 'progress-photos', file: File, ownerId: string) {
  if (!isSupabaseConfigured()) {
    return URL.createObjectURL(file);
  }
  const extension = file.name.split('.').pop() || 'jpg';
  const path = `${ownerId}/${makeSafeId('upload')}.${extension}`;
  const { error } = await requireSupabase().storage.from(bucket).upload(path, file, { upsert: false });
  if (error) throw error;
  const { data } = requireSupabase().storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}
