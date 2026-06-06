import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  headers?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type CreateStudentAccessPayload = {
  studentId?: unknown;
  email?: unknown;
  password?: unknown;
  fullName?: unknown;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'SUPABASE_URL/VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY não configurada no servidor.' });
    return;
  }

  try {
    const payload = parsePayload(req.body);
    const studentId = String(payload.studentId ?? '').trim();
    const email = String(payload.email ?? '').trim().toLowerCase();
    const password = String(payload.password ?? '');
    const fullName = String(payload.fullName ?? '').trim() || email;

    if (!studentId) {
      res.status(400).json({ error: 'Aluno obrigatório.' });
      return;
    }
    if (!email || !email.includes('@')) {
      res.status(400).json({ error: 'E-mail de acesso inválido.' });
      return;
    }
    if (password.length < 6) {
      res.status(400).json({ error: 'A senha temporária precisa ter pelo menos 6 caracteres.' });
      return;
    }

    const authHeader = readHeader(req.headers, 'authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      res.status(401).json({ error: 'Sessão não encontrada. Entre como Personal/Admin novamente.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: requesterData, error: requesterError } = await supabaseAdmin.auth.getUser(token);
    if (requesterError || !requesterData.user) {
      res.status(401).json({ error: 'Sessão inválida. Entre novamente.' });
      return;
    }

    const { data: requesterProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', requesterData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;
    if (requesterProfile?.role !== 'admin') {
      res.status(403).json({ error: 'Apenas Personal/Admin pode criar acesso de aluno.' });
      return;
    }

    const existingUser = await findAuthUserByEmail(supabaseAdmin, email);
    if (existingUser) {
      res.status(409).json({ error: 'Este e-mail já possui acesso. Use Vincular acesso existente.' });
      return;
    }

    const { data: createdUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: fullName,
        role: 'student'
      }
    });
    if (createError || !createdUser.user) {
      const message = createError?.message?.toLowerCase().includes('already')
        ? 'Este e-mail já possui acesso. Use Vincular acesso existente.'
        : createError?.message || 'Não foi possível criar o usuário do aluno.';
      res.status(createError?.message?.toLowerCase().includes('already') ? 409 : 500).json({ error: message });
      return;
    }

    const profileId = createdUser.user.id;
    const { error: upsertProfileError } = await supabaseAdmin.from('profiles').upsert(
      {
        id: profileId,
        email,
        full_name: fullName,
        role: 'student'
      },
      { onConflict: 'id' }
    );
    if (upsertProfileError) throw upsertProfileError;

    const { data: updatedStudent, error: updateStudentError } = await supabaseAdmin
      .from('students')
      .update({ profile_id: profileId, email })
      .eq('id', studentId)
      .select('id,profile_id,email')
      .maybeSingle();
    if (updateStudentError) throw updateStudentError;
    if (!updatedStudent) {
      res.status(404).json({ error: 'Aluno selecionado não encontrado.' });
      return;
    }

    res.status(200).json({
      message: 'Acesso do aluno criado com sucesso.',
      profileId,
      studentId: updatedStudent.id,
      email: updatedStudent.email
    });
  } catch (error) {
    console.error('Erro ao criar acesso do aluno:', error);
    res.status(500).json({ error: 'Não foi possível criar o acesso do aluno agora.' });
  }
}

function parsePayload(body: unknown): CreateStudentAccessPayload {
  if (typeof body === 'string') return JSON.parse(body) as CreateStudentAccessPayload;
  return (body ?? {}) as CreateStudentAccessPayload;
}

function readHeader(headers: ApiRequest['headers'], name: string) {
  if (!headers) return '';
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct ?? '';
}

function normalizeSupabaseUrl(value: unknown) {
  const rawUrl = String(value ?? '').trim().replace(/^['"]|['"]$/g, '');
  if (!rawUrl) return '';
  try {
    const parsed = new URL(rawUrl);
    return parsed.protocol === 'https:' ? parsed.origin : '';
  } catch {
    return '';
  }
}

async function findAuthUserByEmail(supabaseAdmin: ReturnType<typeof createClient>, email: string) {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 100 });
    if (error) throw error;
    const found = data.users.find((user) => user.email?.toLowerCase() === email);
    if (found) return found;
    if (data.users.length < 100) return null;
  }
  return null;
}
