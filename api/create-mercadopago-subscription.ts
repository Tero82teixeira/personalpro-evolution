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

type MercadoPagoSubscriptionPayload = {
  planId?: unknown;
  planName?: unknown;
  price?: unknown;
  personalName?: unknown;
  personalEmail?: unknown;
  userId?: unknown;
  profileId?: unknown;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo nao permitido.' });
    return;
  }

  console.log('MP subscription route called');
  const accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '').trim();
  console.log('MP subscription token configured:', Boolean(accessToken));
  console.log('MP subscription env:', {
    hasToken: Boolean(accessToken),
    hasApiUrl: Boolean(process.env.MERCADO_PAGO_API_URL),
    hasAppUrl: Boolean(process.env.APP_PUBLIC_URL)
  });
  if (!accessToken) {
    res.status(503).json({
      ok: false,
      friendlyMessage: 'MERCADO_PAGO_ACCESS_TOKEN nao configurado na Vercel.',
      mercadoPagoStatus: 503,
      mercadoPagoError: 'Mercado Pago nao configurado.',
      mercadoPagoCause: ''
    });
    return;
  }

  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    res.status(500).json({ error: 'SUPABASE_URL/VITE_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY nao configurada no servidor.' });
    return;
  }

  try {
    const authHeader = readHeader(req.headers, 'authorization');
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token) {
      res.status(401).json({ error: 'Sessao nao encontrada. Entre como Personal/Admin novamente.' });
      return;
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    });

    const { data: requesterData, error: requesterError } = await supabaseAdmin.auth.getUser(token);
    if (requesterError || !requesterData.user) {
      res.status(401).json({ error: 'Sessao invalida. Entre novamente.' });
      return;
    }

    const { data: requesterProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role,email,full_name')
      .eq('id', requesterData.user.id)
      .maybeSingle();
    if (profileError) throw profileError;

    const requesterEmail = requesterData.user.email ?? requesterProfile?.email ?? '';
    const requesterRole = requesterProfile?.role;
    const allowed = requesterRole === 'admin' || requesterRole === 'super_admin' || requesterEmail.toLowerCase() === 'ronaldositeseblogs@gmail.com';
    if (!allowed) {
      res.status(403).json({ error: 'Apenas Personal/Admin pode criar assinatura.' });
      return;
    }

    const payload = parsePayload(req.body);
    const planId = cleanText(payload.planId);
    const planName = cleanText(payload.planName);
    const personalName = cleanText(payload.personalName) || cleanText(requesterProfile?.full_name) || requesterEmail;
    const personalEmail = cleanText(payload.personalEmail).toLowerCase() || requesterEmail;
    const profileId = cleanText(payload.profileId) || cleanText(payload.userId) || requesterData.user.id;
    const price = normalizePrice(payload.price);

    if (!planId || !planName) {
      res.status(400).json({ error: 'Plano obrigatorio.' });
      return;
    }
    if (!personalEmail || !personalEmail.includes('@')) {
      res.status(400).json({ error: 'E-mail do personal invalido.' });
      return;
    }
    if (!price || price <= 0) {
      res.status(400).json({ error: 'Valor do plano invalido.' });
      return;
    }

    const apiUrl = normalizeMercadoPagoApiUrl(process.env.MERCADO_PAGO_API_URL);
    const appPublicUrl = normalizePublicUrl(process.env.APP_PUBLIC_URL);
    console.log('MP subscription payload summary:', {
      planName,
      price,
      hasEmail: Boolean(personalEmail)
    });
    const mercadoPagoResponse = await fetch(`${apiUrl}/preapproval`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        reason: `PersonalPro Evolution - ${planName}`,
        external_reference: `${profileId}:${planId}`,
        payer_email: personalEmail,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: price,
          currency_id: 'BRL'
        },
        back_url: appPublicUrl || undefined,
        status: 'pending'
      })
    });

    const responseBody = await mercadoPagoResponse.json().catch(() => ({}));
    console.log('MP subscription response status:', mercadoPagoResponse.status);
    if (!mercadoPagoResponse.ok) {
      const safeErrorSummary = buildMercadoPagoErrorSummary(
        responseBody,
        mercadoPagoResponse.status,
        mercadoPagoResponse.statusText,
        friendlyMercadoPagoSubscriptionError(mercadoPagoResponse.status)
      );
      console.log('MP subscription error status:', mercadoPagoResponse.status);
      console.log('MP subscription error body:', safeErrorSummary);
      res.status(502).json(safeErrorSummary);
      return;
    }

    const checkoutUrl = responseBody.init_point || responseBody.sandbox_init_point || responseBody.checkout_url || '';
    res.status(200).json({
      ok: true,
      checkoutUrl,
      init_point: responseBody.init_point,
      subscriptionId: responseBody.id,
      preapprovalId: responseBody.id,
      status: responseBody.status || 'pending',
      gateway: 'Mercado Pago',
      personalName
    });
  } catch (error) {
    console.error('Erro ao criar assinatura Mercado Pago:', error);
    res.status(500).json({ error: 'Nao foi possivel criar a assinatura no Mercado Pago.' });
  }
}

function parsePayload(body: unknown): MercadoPagoSubscriptionPayload {
  if (typeof body === 'string') return JSON.parse(body) as MercadoPagoSubscriptionPayload;
  return (body ?? {}) as MercadoPagoSubscriptionPayload;
}

function readHeader(headers: ApiRequest['headers'], name: string) {
  if (!headers) return '';
  const direct = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(direct) ? direct[0] : direct ?? '';
}

function cleanText(value: unknown) {
  return String(value ?? '').trim().slice(0, 300);
}

function normalizePrice(value: unknown) {
  if (typeof value === 'number') return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
  const raw = String(value ?? '').trim();
  if (!raw) return 0;
  const normalized = raw
    .replace(/[^\d,.-]/g, '')
    .replace(/\.(?=\d{3}(?:\D|$))/g, '')
    .replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? Number(parsed.toFixed(2)) : 0;
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

function normalizeMercadoPagoApiUrl(value: unknown) {
  const rawUrl = String(value ?? 'https://api.mercadopago.com').trim() || 'https://api.mercadopago.com';
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin;
  } catch {
    return 'https://api.mercadopago.com';
  }
}

function normalizePublicUrl(value: unknown) {
  const rawUrl = String(value ?? 'https://personalpro-evolution.vercel.app').trim() || 'https://personalpro-evolution.vercel.app';
  try {
    const parsed = new URL(rawUrl);
    return parsed.origin;
  } catch {
    return 'https://personalpro-evolution.vercel.app';
  }
}

function friendlyMercadoPagoSubscriptionError(status: number) {
  if (status === 401 || status === 403) return 'Token do Mercado Pago invalido ou sem permissao.';
  if (status === 400) return 'Dados enviados ao Mercado Pago invalidos.';
  return 'Nao foi possivel criar a assinatura no Mercado Pago.';
}

function buildMercadoPagoErrorSummary(body: any, status: number, statusText: string, fallbackFriendlyMessage: string) {
  const mercadoPagoError = cleanText(body?.message || body?.error_description || body?.error || statusText || fallbackFriendlyMessage);
  const mercadoPagoCause = summarizeCause(body?.cause);
  const sellerEmailHint = buildSellerEmailHint(`${mercadoPagoError} ${mercadoPagoCause}`);
  const finalCause = sellerEmailHint ? [mercadoPagoCause, sellerEmailHint].filter(Boolean).join(' | ') : mercadoPagoCause;
  return {
    ok: false,
    friendlyMessage: fallbackFriendlyMessage,
    mercadoPagoStatus: status,
    mercadoPagoError,
    mercadoPagoCause: finalCause
  };
}

function summarizeCause(cause: any) {
  const firstCause = Array.isArray(cause) ? cause[0] : cause;
  if (!firstCause) return '';
  if (typeof firstCause === 'string') return cleanText(firstCause);
  return cleanText(firstCause.description || firstCause.message || firstCause.error || firstCause.code || JSON.stringify(firstCause));
}

function buildSellerEmailHint(value: string) {
  const normalized = value.toLowerCase();
  if (
    normalized.includes('collector') ||
    normalized.includes('same account') ||
    normalized.includes('same user') ||
    normalized.includes('payer') && normalized.includes('seller')
  ) {
    return 'Use um e-mail de comprador diferente do e-mail da conta Mercado Pago vendedora.';
  }
  return '';
}
