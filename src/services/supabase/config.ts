function cleanEnvValue(value: unknown) {
  return String(value ?? '').trim().replace(/^['"]|['"]$/g, '');
}

function normalizeSupabaseUrl(value: unknown) {
  const rawUrl = cleanEnvValue(value);
  if (!rawUrl) {
    return { rawUrl, url: '', error: '' };
  }

  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'https:') {
      return { rawUrl, url: '', error: 'Configuração do Supabase inválida. VITE_SUPABASE_URL precisa começar com https://.' };
    }

    return {
      rawUrl,
      url: parsed.origin,
      error: ''
    };
  } catch {
    return { rawUrl, url: '', error: 'Configuração do Supabase inválida. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.' };
  }
}

const normalizedUrl = normalizeSupabaseUrl(import.meta.env.VITE_SUPABASE_URL);
const anonKey = cleanEnvValue(import.meta.env.VITE_SUPABASE_ANON_KEY);

export const supabaseConfig = {
  rawUrl: normalizedUrl.rawUrl,
  url: normalizedUrl.url,
  anonKey,
  error: normalizedUrl.error
};

export function isSupabaseConfigured() {
  return Boolean(supabaseConfig.url && supabaseConfig.anonKey && !supabaseConfig.error);
}

export function hasSupabaseEnv() {
  return Boolean(supabaseConfig.rawUrl || supabaseConfig.anonKey);
}

export function getSupabaseConfigError() {
  if (!hasSupabaseEnv()) return '';
  if (supabaseConfig.error) return supabaseConfig.error;
  if (!supabaseConfig.url || !supabaseConfig.anonKey) {
    return 'Configuração do Supabase inválida. Verifique VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY.';
  }
  return '';
}
