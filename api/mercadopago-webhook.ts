import { createClient } from '@supabase/supabase-js';

type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

type MercadoPagoDetails = Record<string, any>;

const planCatalog: Record<string, { planName: string; maxStudents: number; aiLimit: number }> = {
  basic: { planName: 'Basico', maxStudents: 10, aiLimit: 0 },
  premium: { planName: 'Premium', maxStudents: 50, aiLimit: 100 },
  pro: { planName: 'Pro', maxStudents: 200, aiLimit: 300 },
  'admin-test': { planName: 'Admin/Teste', maxStudents: 9999, aiLimit: 9999 }
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ received: false, error: 'Metodo nao permitido.' });
    return;
  }

  try {
    const payload = parsePayload(req.body);
    const eventType = normalizeEventType(payload.type ?? payload.topic ?? req.query?.type ?? req.query?.topic);
    const action = cleanText(payload.action);
    const dataId = cleanText(payload.data?.id ?? payload.id ?? req.query?.id ?? req.query?.['data.id']);

    console.log('MP webhook received:', {
      eventType,
      action,
      hasDataId: Boolean(dataId)
    });
    console.log('MP webhook env:', {
      hasToken: Boolean(process.env.MERCADO_PAGO_ACCESS_TOKEN),
      hasApiUrl: Boolean(process.env.MERCADO_PAGO_API_URL),
      hasSupabaseUrl: Boolean(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL),
      hasServiceRole: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)
    });

    if (!eventType || !dataId || !isSupportedEvent(eventType)) {
      console.log('MP webhook ignored:', { eventType, hasDataId: Boolean(dataId) });
      res.status(200).json({ received: true, ignored: true });
      return;
    }

    const details = await fetchMercadoPagoDetails(eventType, dataId);
    if (!details) {
      res.status(200).json({ received: true, detailsFetched: false });
      return;
    }

    const eventSummary = buildEventSummary(eventType, details);
    console.log('MP webhook detail summary:', {
      eventType,
      mercadoPagoId: eventSummary.mercadoPagoId,
      status: eventSummary.status,
      paymentMethod: eventSummary.paymentMethod,
      amount: eventSummary.amount,
      hasExternalReference: Boolean(eventSummary.externalReference)
    });

    await persistPaymentEvent(eventType, dataId, payload, eventSummary);

    const reference = parseExternalReference(eventSummary.externalReference);
    if (!reference) {
      console.log('MP webhook without usable external_reference. Subscription not updated.');
      res.status(200).json({ received: true, subscriptionUpdated: false, reason: 'missing_external_reference' });
      return;
    }

    const updated = await persistSubscription(reference.userId, reference.planId, eventSummary);
    res.status(200).json({ received: true, subscriptionUpdated: updated });
  } catch (error) {
    console.error('MP webhook safe failure:', summarizeUnknownError(error));
    res.status(200).json({ received: true });
  }
}

async function fetchMercadoPagoDetails(eventType: string, dataId: string): Promise<MercadoPagoDetails | null> {
  const accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '').trim();
  if (!accessToken) {
    console.log('MP webhook detail skipped: MERCADO_PAGO_ACCESS_TOKEN not configured.');
    return null;
  }

  const detailPath = detailPathForEvent(eventType, dataId);
  if (!detailPath) return null;

  const apiUrl = normalizeMercadoPagoApiUrl(process.env.MERCADO_PAGO_API_URL);
  const response = await fetch(`${apiUrl}${detailPath}`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  const body = await response.json().catch(() => ({}));
  console.log('MP webhook detail response:', {
    eventType,
    status: response.status,
    ok: response.ok,
    hasBody: Boolean(body && Object.keys(body).length)
  });

  if (!response.ok) {
    console.log('MP webhook detail error:', buildSafeMercadoPagoError(body, response.status, response.statusText));
    return null;
  }

  return body;
}

function buildEventSummary(eventType: string, details: MercadoPagoDetails) {
  const isPayment = eventType === 'payment' || Boolean(details.payment_method_id);
  const paymentMethodId = cleanText(details.payment_method_id);
  const status = cleanText(details.status);
  const externalReference = cleanText(details.external_reference);
  const preapprovalId = cleanText(details.preapproval_id ?? details.preapproval?.id);
  const paymentId = cleanText(details.id);
  const amount = normalizeAmount(details.transaction_amount ?? details.auto_recurring?.transaction_amount);
  const payerEmail = cleanText(details.payer?.email ?? details.payer_email);
  const gateway = isPayment && paymentMethodId === 'pix' ? 'Mercado Pago Pix' : 'Mercado Pago';
  const paymentMethod = isPayment && paymentMethodId === 'pix' ? 'Pix' : 'Cartao de credito';

  return {
    eventType,
    mercadoPagoId: paymentId,
    paymentId: isPayment ? paymentId : '',
    preapprovalId: isPayment ? preapprovalId : paymentId,
    status,
    statusDetail: cleanText(details.status_detail),
    paymentMethodId,
    paymentMethod,
    gateway,
    amount,
    externalReference,
    payerEmail,
    reason: cleanText(details.reason),
    rawStatus: status
  };
}

async function persistPaymentEvent(eventType: string, eventId: string, payload: unknown, summary: ReturnType<typeof buildEventSummary>) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.log('MP webhook event persistence skipped: Supabase service role not configured.');
    return false;
  }

  const safePayload = {
    event_type: eventType,
    event_id: eventId,
    status: summary.status,
    external_reference: summary.externalReference,
    mercado_pago_id: summary.mercadoPagoId,
    received_payload: payload
  };

  try {
    const { error } = await supabase.from('payment_events').insert({
      provider: 'mercado_pago',
      event_type: eventType,
      event_id: eventId,
      payload: safePayload
    });
    if (error) {
      logPersistenceWarning('payment_events', error);
      return false;
    }
    return true;
  } catch (error) {
    logPersistenceWarning('payment_events', error);
    return false;
  }
}

async function persistSubscription(userId: string, planId: string, summary: ReturnType<typeof buildEventSummary>) {
  const supabase = createSupabaseAdminClient();
  if (!supabase) {
    console.log('Webhook recebido, mas persistencia de assinatura ainda nao configurada.');
    return false;
  }

  const plan = planCatalog[planId] ?? planCatalog.basic;
  const now = new Date();
  const periodEnd = addDays(now, 30).toISOString();
  const approved = ['approved', 'authorized'].includes(summary.status);
  const subscriptionStatus = mapMercadoPagoStatus(summary.status);
  const row = {
    profile_id: userId,
    plan_id: planId,
    plan_name: plan.planName,
    status: subscriptionStatus,
    gateway: summary.gateway,
    payment_method: summary.paymentMethod,
    mercado_pago_payment_id: summary.paymentId || null,
    mercado_pago_preapproval_id: summary.preapprovalId || null,
    external_reference: summary.externalReference,
    amount: summary.amount,
    started_at: approved ? now.toISOString() : null,
    current_period_end: approved ? periodEnd : null,
    last_event_type: summary.eventType,
    last_event_status: summary.status,
    updated_at: now.toISOString()
  };

  try {
    const { error } = await supabase
      .from('subscriptions')
      .upsert(row, { onConflict: 'profile_id' });

    if (error) {
      logPersistenceWarning('subscriptions', error);
      return false;
    }

    console.log('MP webhook subscription persisted:', {
      profileId: userId,
      planId,
      status: subscriptionStatus,
      gateway: summary.gateway
    });
    return true;
  } catch (error) {
    logPersistenceWarning('subscriptions', error);
    return false;
  }
}

function createSupabaseAdminClient() {
  const supabaseUrl = normalizeSupabaseUrl(process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL);
  const serviceRoleKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!supabaseUrl || !serviceRoleKey) return null;
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false }
  });
}

function parsePayload(body: unknown): any {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body ?? {};
}

function parseExternalReference(value: string) {
  const [userId, planId] = cleanText(value).split(':').map((item) => item.trim());
  if (!userId || !planId) return null;
  return { userId, planId };
}

function normalizeEventType(value: unknown) {
  const raw = cleanText(value);
  if (raw === 'subscription_preapproval') return 'preapproval';
  return raw;
}

function isSupportedEvent(type: string) {
  return ['preapproval', 'subscription_preapproval', 'subscription_authorized_payment', 'payment'].includes(type);
}

function detailPathForEvent(type: string, id: string) {
  if (type === 'payment') return `/v1/payments/${encodeURIComponent(id)}`;
  if (type === 'preapproval' || type === 'subscription_preapproval') return `/preapproval/${encodeURIComponent(id)}`;
  if (type === 'subscription_authorized_payment') return `/authorized_payments/${encodeURIComponent(id)}`;
  return '';
}

function mapMercadoPagoStatus(status: string) {
  if (status === 'approved' || status === 'authorized') return 'Ativa';
  if (status === 'pending' || status === 'paused') return 'Vencida';
  if (status === 'cancelled') return 'Cancelada';
  if (status === 'rejected') return 'Bloqueada';
  return 'Vencida';
}

function cleanText(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim().slice(0, 300);
}

function normalizeAmount(value: unknown) {
  const number = Number(value ?? 0);
  return Number.isFinite(number) ? Number(number.toFixed(2)) : 0;
}

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
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

function buildSafeMercadoPagoError(body: any, status: number, statusText: string) {
  return {
    status,
    statusText: cleanText(statusText),
    message: cleanText(body?.message || body?.error_description || body?.error),
    cause: summarizeCause(body?.cause)
  };
}

function summarizeCause(cause: any) {
  const firstCause = Array.isArray(cause) ? cause[0] : cause;
  if (!firstCause) return '';
  if (typeof firstCause === 'string') return cleanText(firstCause);
  return cleanText(firstCause.description || firstCause.message || firstCause.error || firstCause.code || JSON.stringify(firstCause));
}

function summarizeUnknownError(error: unknown) {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { message: cleanText(error) };
}

function logPersistenceWarning(table: string, error: any) {
  const code = cleanText(error?.code);
  const message = cleanText(error?.message || error);
  if (code === '42P01' || message.toLowerCase().includes('does not exist')) {
    console.log(`Webhook recebido, mas persistencia de assinatura ainda nao configurada. Tabela ausente: ${table}.`);
    return;
  }
  console.log(`MP webhook persistence warning (${table}):`, { code, message });
}
