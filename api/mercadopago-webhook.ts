type ApiRequest = {
  method?: string;
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Metodo nao permitido.' });
    return;
  }

  try {
    const payload = parsePayload(req.body);
    const eventType = cleanText(payload.type ?? payload.topic ?? req.query?.type ?? req.query?.topic);
    const action = cleanText(payload.action);
    const dataId = cleanText(payload.data?.id ?? payload.id ?? req.query?.id ?? req.query?.['data.id']);

    console.log('Webhook Mercado Pago recebido:', {
      type: eventType,
      action,
      dataId
    });

    const accessToken = String(process.env.MERCADO_PAGO_ACCESS_TOKEN ?? '').trim();
    if (accessToken && dataId && shouldFetchDetails(eventType)) {
      const apiUrl = normalizeMercadoPagoApiUrl(process.env.MERCADO_PAGO_API_URL);
      const detailPath = detailPathForEvent(eventType, dataId);
      if (detailPath) {
        const detailResponse = await fetch(`${apiUrl}${detailPath}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        console.log('Detalhe Mercado Pago consultado:', {
          type: eventType,
          status: detailResponse.status,
          ok: detailResponse.ok
        });
      }
    }

    // Estrutura preparada: quando houver persistencia real, atualizar status da assinatura aqui.
    res.status(200).json({ received: true });
  } catch (error) {
    console.error('Erro no webhook Mercado Pago:', error);
    res.status(200).json({ received: true });
  }
}

function parsePayload(body: unknown): any {
  if (typeof body === 'string') return JSON.parse(body || '{}');
  return body ?? {};
}

function cleanText(value: unknown) {
  return String(Array.isArray(value) ? value[0] ?? '' : value ?? '').trim().slice(0, 200);
}

function shouldFetchDetails(type: string) {
  return ['preapproval', 'subscription_preapproval', 'subscription_authorized_payment', 'payment'].includes(type);
}

function detailPathForEvent(type: string, id: string) {
  if (type === 'payment') return `/v1/payments/${encodeURIComponent(id)}`;
  if (type === 'preapproval' || type === 'subscription_preapproval') return `/preapproval/${encodeURIComponent(id)}`;
  if (type === 'subscription_authorized_payment') return `/authorized_payments/${encodeURIComponent(id)}`;
  return '';
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
