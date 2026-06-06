type ApiRequest = {
  method?: string;
  body?: unknown;
};

type ApiResponse = {
  status: (code: number) => ApiResponse;
  json: (body: unknown) => void;
  setHeader?: (name: string, value: string) => void;
};

const maxPayloadLength = 12000;

export default async function handler(req: ApiRequest, res: ApiResponse) {
  console.log('API IA chamada');
  console.log('OPENAI_API_KEY configurada:', Boolean(process.env.OPENAI_API_KEY));

  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Método não permitido.' });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'OPENAI_API_KEY não configurada no ambiente.' });
    return;
  }

  try {
    const payload = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    console.log('Payload recebido:', Boolean(payload));
    if (!payload || typeof payload !== 'object') {
      res.status(400).json({ error: 'Payload inválido.' });
      return;
    }

    const studentReport = sanitizePayload(payload);
    if (!studentReport.studentName) {
      res.status(400).json({ error: 'Nome do aluno é obrigatório.' });
      return;
    }

    const serialized = JSON.stringify(studentReport).slice(0, maxPayloadLength);
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'gpt-4.1-mini',
        input: [
          {
            role: 'system',
            content:
              'Você é um assistente profissional para personal trainers. Gere uma análise clara, objetiva e ética. Não faça diagnóstico médico. Não prometa resultados. Não prescreva tratamento. Use linguagem profissional, motivadora e segura. Baseie-se apenas nos dados fornecidos. Se faltar dado, diga que os dados são insuficientes.'
          },
          {
            role: 'user',
            content:
              `Gere uma análise profissional para o Relatório Inteligente do Aluno no formato:\n\n` +
              `1. Resumo profissional\n2. Evolução corporal\n3. Consistência de treino\n4. Check-ins e comportamento\n5. Hidratação\n6. Pontos de atenção\n7. Recomendações para os próximos 7 dias\n8. Mensagem sugerida para o aluno\n\n` +
              `Dados resumidos do aluno:\n${serialized}`
          }
        ],
        max_output_tokens: 1200
      })
    });

    if (!response.ok) {
      const errorBody = await response.json().catch(() => null);
      const openAiMessage = cleanText(errorBody?.error?.message || errorBody?.message || response.statusText);
      console.error('Erro OpenAI ao gerar análise:', {
        status: response.status,
        statusText: response.statusText,
        hasErrorMessage: Boolean(openAiMessage)
      });
      if ([401, 403, 429].includes(response.status)) {
        res.status(502).json({ error: 'Erro ao gerar análise com IA. Verifique sua chave ou saldo da API.' });
        return;
      }
      res.status(502).json({ error: 'Erro ao gerar análise com IA. Verifique sua chave ou saldo da API.' });
      return;
    }

    const data = await response.json();
    const analysis = extractResponseText(data);
    if (!analysis) {
      res.status(502).json({ error: 'A IA não retornou uma análise válida.' });
      return;
    }

    res.status(200).json({ analysis });
  } catch (error) {
    console.error('Erro ao gerar análise com IA:', error);
    res.status(500).json({ error: 'Não foi possível gerar a análise com IA agora.' });
  }
}

function sanitizePayload(payload: Record<string, unknown>) {
  return {
    studentName: cleanText(payload.studentName),
    goal: cleanText(payload.goal),
    bodyEvolution: payload.bodyEvolution,
    trainingConsistency: payload.trainingConsistency,
    checkinBehavior: payload.checkinBehavior,
    hydration: payload.hydration,
    weeklyGoals: payload.weeklyGoals,
    abandonmentRisk: cleanText(payload.abandonmentRisk),
    positives: Array.isArray(payload.positives) ? payload.positives.map(cleanText).slice(0, 10) : [],
    attentionPoints: Array.isArray(payload.attentionPoints) ? payload.attentionPoints.map(cleanText).slice(0, 10) : []
  };
}

function cleanText(value: unknown) {
  return String(value ?? '').slice(0, 500);
}

function extractResponseText(data: any) {
  if (typeof data?.output_text === 'string') return data.output_text.trim();
  const parts = data?.output
    ?.flatMap((item: any) => item?.content ?? [])
    ?.map((content: any) => content?.text)
    ?.filter(Boolean);
  return Array.isArray(parts) ? parts.join('\n').trim() : '';
}
