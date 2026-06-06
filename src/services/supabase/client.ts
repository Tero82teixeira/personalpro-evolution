import { createClient } from '@supabase/supabase-js';
import { getSupabaseConfigError, isSupabaseConfigured, supabaseConfig } from './config';

export const supabase = isSupabaseConfigured()
  ? createClient(supabaseConfig.url, supabaseConfig.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'personalpro:supabase-session'
      }
    })
  : null;

export function requireSupabase() {
  const configError = getSupabaseConfigError();
  if (configError) {
    throw new Error(configError);
  }
  if (!supabase) {
    throw new Error('Supabase não configurado. Usando fallback localStorage.');
  }
  return supabase;
}
