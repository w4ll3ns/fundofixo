import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const systemPrompt = `Você é um especialista em leitura de notas fiscais brasileiras. Analise o documento fornecido e extraia as informações de TODAS as notas fiscais encontradas.

IMPORTANTE: Um documento pode conter MÚLTIPLAS notas fiscais (uma por página ou várias na mesma página). Você deve identificar e extrair CADA nota fiscal separadamente.

Para CADA nota fiscal encontrada, extraia:
1. VALOR TOTAL - Procure por "TOTAL", "VALOR TOTAL", "TOTAL A PAGAR", "VALOR A PAGAR", "TOTAL GERAL". Ignore subtotais.
2. DATA DE EMISSÃO - no formato YYYY-MM-DD
3. NÚMERO DA NOTA
4. CNPJ DO EMITENTE - apenas números
5. NOME DO EMITENTE/RAZÃO SOCIAL
6. PÁGINA - em qual página está a nota (1, 2, 3...)

Responda SEMPRE em JSON válido com esta estrutura exata:
{
  "notas_encontradas": número total de notas encontradas,
  "notas": [
    {
      "pagina": número da página,
      "total_value": número ou null,
      "confidence_label": "alta" | "media" | "baixa",
      "evidence_text": "trecho onde encontrou (máx 50 chars)",
      "extracted_fields": {
        "data_emissao": "YYYY-MM-DD" ou null,
        "numero_nota": "string" ou null,
        "cnpj_emitente": "apenas números" ou null,
        "nome_emitente": "string" ou null
      }
    }
  ]
}

Regras de confiança:
- ALTA: encontrou "TOTAL" com valor claro
- MEDIA: encontrou um valor que parece ser o total mas sem keyword clara
- BAIXA: incerto ou múltiplos candidatos

Se não conseguir identificar nenhuma nota, retorne: { "notas_encontradas": 0, "notas": [] }`;

async function callLovableAI(model: string, userContent: any): Promise<string> {
  const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
  if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY não configurada');

  const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${LOVABLE_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    console.error('Lovable AI error:', response.status, txt);
    if (response.status === 429) throw Object.assign(new Error('Limite de requisições do Lovable AI excedido. Tente novamente em alguns minutos.'), { status: 429 });
    if (response.status === 402) throw Object.assign(new Error('Créditos do Lovable AI esgotados. Adicione créditos ou troque para sua chave OpenAI em /admin/configuracoes.'), { status: 402 });
    throw new Error('Falha ao processar com Lovable AI');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

async function callOpenAI(model: string, userContent: any, isPDF: boolean, base64Data: string): Promise<string> {
  const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
  if (!OPENAI_API_KEY) {
    throw Object.assign(
      new Error('Chave OpenAI não configurada. Configure em /admin/configuracoes (aba Inteligência Artificial).'),
      { status: 400 }
    );
  }

  // PDFs: use Responses API with input_file (native PDF support)
  if (isPDF) {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        text: { format: { type: 'json_object' } },
        input: [
          {
            role: 'system',
            content: [{ type: 'input_text', text: systemPrompt }],
          },
          {
            role: 'user',
            content: [
              { type: 'input_text', text: 'Analise esta nota fiscal em PDF e extraia os dados. Retorne apenas JSON válido, sem markdown.' },
              {
                type: 'input_file',
                filename: 'nota.pdf',
                file_data: `data:application/pdf;base64,${base64Data}`,
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const txt = await response.text();
      console.error('OpenAI Responses error:', response.status, txt);
      if (response.status === 401) throw Object.assign(new Error('Chave OpenAI inválida. Atualize em /admin/configuracoes.'), { status: 401 });
      if (response.status === 429) throw Object.assign(new Error('Limite de requisições da OpenAI excedido.'), { status: 429 });
      if (txt.includes('insufficient_quota') || response.status === 402) {
        throw Object.assign(new Error('Sem créditos na sua conta OpenAI. Adicione créditos em platform.openai.com/billing.'), { status: 402 });
      }
      throw new Error('Falha ao processar PDF com OpenAI');
    }

    const data = await response.json();
    // Responses API: try multiple extraction paths
    const text = data.output_text
      ?? data.output?.[0]?.content?.[0]?.text
      ?? data.output?.find((o: any) => o.type === 'message')?.content?.find((c: any) => c.type === 'output_text')?.text
      ?? '';
    if (!text) {
      console.error('OpenAI Responses returned empty text. Raw data:', JSON.stringify(data).slice(0, 1500));
    }
    return text;
  }

  // Images: use Chat Completions with image_url
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userContent },
      ],
    }),
  });

  if (!response.ok) {
    const txt = await response.text();
    console.error('OpenAI Chat error:', response.status, txt);
    if (response.status === 401) throw Object.assign(new Error('Chave OpenAI inválida. Atualize em /admin/configuracoes.'), { status: 401 });
    if (response.status === 429) throw Object.assign(new Error('Limite de requisições da OpenAI excedido.'), { status: 429 });
    if (txt.includes('insufficient_quota') || response.status === 402) {
      throw Object.assign(new Error('Sem créditos na sua conta OpenAI. Adicione créditos em platform.openai.com/billing.'), { status: 402 });
    }
    throw new Error('Falha ao processar imagem com OpenAI');
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content ?? '';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type } = await req.json();

    console.log('Received request with file_type:', file_type);

    if (!file_base64) {
      return new Response(
        JSON.stringify({ error: 'Arquivo não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Read provider config from DB (service role, bypasses RLS)
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(supabaseUrl, serviceKey);
    const { data: cfg } = await sb
      .from('ai_config')
      .select('provider, openai_model, lovable_model')
      .limit(1)
      .maybeSingle();

    const provider = cfg?.provider ?? 'lovable';
    const lovableModel = cfg?.lovable_model ?? 'google/gemini-2.5-flash';
    const openaiModel = cfg?.openai_model ?? 'gpt-4o';

    console.log('AI provider:', provider);

    const isPDF = file_type === 'application/pdf' ||
      file_base64.startsWith('data:application/pdf') ||
      file_base64.includes('application/pdf');

    let base64Data = file_base64;
    let mimeType = file_type || 'image/jpeg';
    if (file_base64.includes(',')) {
      const parts = file_base64.split(',');
      base64Data = parts[1];
      const mimeMatch = parts[0].match(/data:([^;]+)/);
      if (mimeMatch) mimeType = mimeMatch[1];
    }

    const userContent = isPDF
      ? [
          { type: 'text', text: 'Analise esta nota fiscal em PDF e extraia os dados. Retorne apenas JSON, sem markdown.' },
          { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64Data}` } },
        ]
      : [
          { type: 'text', text: 'Analise esta nota fiscal e extraia os dados. Retorne apenas JSON, sem markdown.' },
          { type: 'image_url', image_url: { url: file_base64.includes('data:') ? file_base64 : `data:${mimeType};base64,${base64Data}` } },
        ];

    let content: string;
    try {
      if (provider === 'openai') {
        let model = openaiModel || 'gpt-4o';
        if (isPDF && /mini|nano/i.test(model)) {
          console.log(`Upgrading model from ${model} to gpt-4o for PDF processing`);
          model = 'gpt-4o';
        }
        content = await callOpenAI(model, userContent, isPDF, base64Data);
      } else {
        const model = isPDF ? 'google/gemini-2.5-pro' : lovableModel;
        content = await callLovableAI(model, userContent);
      }
    } catch (e: any) {
      const status = e?.status ?? 500;
      return new Response(
        JSON.stringify({ error: e?.message ?? 'Erro ao processar com IA' }),
        { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('AI raw response length:', content?.length);
    console.log('AI raw response preview:', (content || '').slice(0, 500));

    // Parse JSON
    let result: any;
    try {
      let jsonStr = (content || '').trim();
      if (jsonStr.startsWith('```json')) jsonStr = jsonStr.slice(7);
      else if (jsonStr.startsWith('```')) jsonStr = jsonStr.slice(3);
      if (jsonStr.endsWith('```')) jsonStr = jsonStr.slice(0, -3);
      jsonStr = jsonStr.trim();

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        const match = jsonStr.match(/\{[\s\S]*\}/);
        if (!match) throw new Error('Nenhum JSON encontrado na resposta');
        parsed = JSON.parse(match[0]);
      }

      if (parsed.notas_encontradas !== undefined && Array.isArray(parsed.notas)) {
        result = parsed;
      } else if (parsed.total_value !== undefined) {
        result = {
          notas_encontradas: 1,
          notas: [{
            pagina: 1,
            total_value: parsed.total_value,
            confidence_label: parsed.confidence_label || 'baixa',
            evidence_text: parsed.evidence_text || '',
            extracted_fields: parsed.extracted_fields || {},
          }],
        };
      } else {
        throw new Error('Formato de resposta não reconhecido');
      }
    } catch (parseError) {
      const sample = (content || '').slice(0, 800);
      console.error('Failed to parse AI response:', parseError);
      console.error('Raw content that failed to parse:', sample);
      result = {
        notas_encontradas: 0,
        notas: [],
        error: 'Falha ao interpretar resposta da IA',
        debug_sample: sample,
      };
    }

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error processing invoice:', error);
    return new Response(
      JSON.stringify({
        notas_encontradas: 0,
        notas: [],
        error: error instanceof Error ? error.message : 'Erro desconhecido',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
