import type { Role, User } from '../types';
import { clearSession, loadData, saveSession } from './storage';
import { requireSupabase, supabase } from './supabase/client';
import { getSupabaseConfigError, isSupabaseConfigured } from './supabase/config';

type ProfileRow = {
  id: string;
  full_name: string;
  email?: string | null;
  role: Role;
  avatar_url?: string | null;
};

function normalizeAuthError(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes('invalid login credentials')) {
    return 'E-mail ou senha inválidos.';
  }
  if (normalized.includes('email not confirmed')) {
    return 'Seu e-mail ainda não foi confirmado. Verifique sua caixa de entrada.';
  }
  if (normalized.includes('invalid path specified in request url')) {
    return 'Erro de configuração da conexão. Verifique as variáveis do Supabase.';
  }
  if (normalized.includes('email rate limit exceeded')) {
    return 'Limite temporário do Supabase atingido. Aguarde alguns minutos ou crie o usuário manualmente no painel do Supabase.';
  }
  return message;
}

function assertSupabaseReady() {
  const configError = getSupabaseConfigError();
  if (configError) {
    console.error('[Auth] Configuração Supabase inválida', {
      stage: 'supabase-config',
      message: configError
    });
    throw new Error(configError);
  }
}

function logAuthError(stage: string, error: { status?: number; name?: string; message?: string } | null | undefined) {
  console.error('[Auth] Falha Supabase', {
    stage,
    status: error?.status,
    name: error?.name,
    message: error?.message
  });
}

async function profileToUser(id: string, email = ''): Promise<User> {
  const profile = await authService.requireProfile(id);
  const { data: students, error } = await requireSupabase().from('students').select('id').eq('profile_id', id);
  if (error) {
    logAuthError('load-student-link', error);
    throw new Error(normalizeAuthError(error.message));
  }
  const student = students?.[0];
  if (profile.role === 'student' && !student) {
    throw new Error('Seu login existe, mas ainda não foi vinculado ao cadastro do aluno. Fale com seu personal.');
  }

  return {
    id,
    name: profile.full_name ?? email,
    email: profile.email ?? email,
    password: '',
    role: profile.role ?? 'student',
    avatar: profile.avatar_url ?? undefined,
    studentId: student?.id
  };
}

export const authService = {
  async requireProfile(id: string): Promise<ProfileRow> {
    const { data: profile, error } = await requireSupabase().from('profiles').select('*').eq('id', id).maybeSingle<ProfileRow>();
    if (error) {
      logAuthError('load-profile', error);
      throw new Error(normalizeAuthError(error.message));
    }
    if (!profile) {
      throw new Error('Perfil não encontrado. Verifique se este usuário possui registro na tabela profiles.');
    }
    return profile;
  },

  async getCurrentUser(): Promise<User | null> {
    assertSupabaseReady();
    if (!isSupabaseConfigured()) {
      const sessionId = localStorage.getItem('personalpro:session');
      return loadData().users.find((user) => user.id === sessionId) ?? null;
    }
    const { data, error } = await requireSupabase().auth.getSession();
    if (error) {
      logAuthError('getSession', error);
      throw new Error(normalizeAuthError(error.message));
    }
    const authUser = data.session?.user;
    if (!authUser) return null;
    return profileToUser(authUser.id, authUser.email ?? '');
  },

  async signIn(email: string, password: string): Promise<User> {
    assertSupabaseReady();
    if (!isSupabaseConfigured()) {
      const user = loadData().users.find((item) => item.email === email && item.password === password);
      if (!user) throw new Error('E-mail ou senha inválidos.');
      saveSession(user.id);
      return user;
    }
    const { data, error } = await requireSupabase().auth.signInWithPassword({ email, password });
    if (error || !data.user) {
      logAuthError('signInWithPassword', error);
      throw new Error(normalizeAuthError(error?.message ?? 'Sessão não criada.'));
    }
    return profileToUser(data.user.id, data.user.email ?? email);
  },

  async signUp(name: string, email: string, password: string, role: Role): Promise<User | null> {
    assertSupabaseReady();
    if (!isSupabaseConfigured()) {
      throw new Error('Cadastro local permanece no fluxo do app quando Supabase não está configurado.');
    }
    const { data, error } = await requireSupabase().auth.signUp({
      email,
      password,
      options: { data: { full_name: name, role } }
    });
    if (error) {
      logAuthError('signUp', error);
      throw new Error(normalizeAuthError(error.message));
    }
    if (!data.user) return null;

    return {
      id: data.user.id,
      name,
      email,
      password: '',
      role
    };
  },

  async resetPassword(email: string) {
    assertSupabaseReady();
    if (!isSupabaseConfigured()) return;
    const { error } = await requireSupabase().auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/`
    });
    if (error) {
      logAuthError('resetPasswordForEmail', error);
      throw new Error(normalizeAuthError(error.message));
    }
  },

  async signOut() {
    if (supabase) {
      await supabase.auth.signOut();
    }
    clearSession();
  }
};
