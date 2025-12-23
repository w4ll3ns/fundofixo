import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { file_base64, file_type } = await req.json();

    if (!file_base64) {
      return new Response(
        JSON.stringify({ error: 'Arquivo não fornecido' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'API key não configurada' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Processing invoice with AI...');

    const systemPrompt = `Você é um especialista em leitura de notas fiscais brasileiras. Analise a imagem/documento fornecido e extraia as seguintes informações:

1. VALOR TOTAL - Este é o mais importante. Procure por:
   - "TOTAL", "VALOR TOTAL", "TOTAL A PAGAR", "VALOR A PAGAR", "TOTAL GERAL"
   - O maior valor monetário próximo a essas palavras-chave
   - Ignore subtotais, descontos, taxas isoladas

2. DATA DE EMISSÃO - no formato YYYY-MM-DD

3. NÚMERO DA NOTA

4. CNPJ DO EMITENTE - apenas números

5. NOME DO EMITENTE/RAZÃO SOCIAL

Responda SEMPRE em JSON válido com esta estrutura exata:
{
  "total_value": número ou null se não encontrado,
  "confidence_label": "alta" | "media" | "baixa",
  "evidence_text": "trecho onde encontrou o total (máximo 50 caracteres)",
  "extracted_fields": {
    "data_emissao": "YYYY-MM-DD" ou null,
    "numero_nota": "string" ou null,
    "cnpj_emitente": "apenas números" ou null,
    "nome_emitente": "string" ou null
  }
}

Regras de confiança:
- ALTA: encontrou "TOTAL" ou similar com valor claro
- MEDIA: encontrou um valor que parece ser o total mas sem keyword clara
- BAIXA: não tem certeza ou encontrou múltiplos candidatos`;

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Analise esta nota fiscal e extraia os dados solicitados. Retorne apenas o JSON, sem markdown.'
              },
              {
                type: 'image_url',
                image_url: {
                  url: file_base64
                }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI Gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Limite de requisições excedido. Tente novamente em alguns minutos.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'Créditos insuficientes. Adicione créditos no Lovable.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ 
          total_value: null,
          confidence_label: 'baixa',
          evidence_text: '',
          extracted_fields: {},
          error: 'Falha ao processar com IA'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    console.log('AI response:', content);

    // Parse the JSON response
    let result;
    try {
      // Remove markdown code blocks if present
      let jsonStr = content.trim();
      if (jsonStr.startsWith('```json')) {
        jsonStr = jsonStr.slice(7);
      } else if (jsonStr.startsWith('```')) {
        jsonStr = jsonStr.slice(3);
      }
      if (jsonStr.endsWith('```')) {
        jsonStr = jsonStr.slice(0, -3);
      }
      jsonStr = jsonStr.trim();
      
      result = JSON.parse(jsonStr);
    } catch (parseError) {
      console.error('Failed to parse AI response:', parseError);
      result = {
        total_value: null,
        confidence_label: 'baixa',
        evidence_text: '',
        extracted_fields: {},
      };
    }

    console.log('Parsed result:', result);

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error processing invoice:', error);
    return new Response(
      JSON.stringify({ 
        total_value: null,
        confidence_label: 'baixa',
        evidence_text: '',
        extracted_fields: {},
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
