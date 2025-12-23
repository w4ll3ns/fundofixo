import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FornecedorCache {
  id: string;
  cnpj: string;
  razao_social: string | null;
  nome_fantasia: string | null;
  endereco_completo: string | null;
  atividade_principal: string | null;
  situacao: string | null;
  consultado_em: string;
}

interface ReceitaWSResponse {
  status: string;
  nome: string;
  fantasia: string;
  logradouro: string;
  numero: string;
  complemento: string;
  bairro: string;
  municipio: string;
  uf: string;
  cep: string;
  situacao: string;
  atividade_principal: Array<{ text: string; code: string }>;
  message?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { cnpj } = await req.json();

    if (!cnpj) {
      return new Response(
        JSON.stringify({ error: 'CNPJ é obrigatório' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Limpar CNPJ - apenas dígitos
    const cnpjLimpo = cnpj.replace(/\D/g, '');

    if (cnpjLimpo.length !== 14) {
      return new Response(
        JSON.stringify({ error: 'CNPJ inválido - deve conter 14 dígitos' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Criar cliente Supabase com service role para bypass RLS
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verificar cache na tabela fornecedores
    const { data: cached, error: cacheError } = await supabase
      .from('fornecedores')
      .select('*')
      .eq('cnpj', cnpjLimpo)
      .maybeSingle();

    if (cacheError) {
      console.error('Erro ao consultar cache:', cacheError);
    }

    if (cached) {
      console.log('CNPJ encontrado no cache:', cnpjLimpo);
      return new Response(
        JSON.stringify({
          source: 'cache',
          data: {
            cnpj: cached.cnpj,
            razao_social: cached.razao_social,
            nome_fantasia: cached.nome_fantasia,
            endereco_completo: cached.endereco_completo,
            atividade_principal: cached.atividade_principal,
            situacao: cached.situacao,
          }
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Consultar API ReceitaWS
    console.log('Consultando ReceitaWS para CNPJ:', cnpjLimpo);
    
    const apiResponse = await fetch(`https://receitaws.com.br/v1/cnpj/${cnpjLimpo}`, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
    });

    // Tratar rate limit
    if (apiResponse.status === 429) {
      console.log('Rate limit atingido na ReceitaWS');
      return new Response(
        JSON.stringify({ 
          error: 'Limite de consultas excedido. Aguarde 1 minuto e tente novamente.',
          code: 'RATE_LIMIT'
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Tratar timeout
    if (apiResponse.status === 504) {
      console.log('Timeout na ReceitaWS');
      return new Response(
        JSON.stringify({ 
          error: 'Serviço da Receita temporariamente indisponível. Tente novamente.',
          code: 'TIMEOUT'
        }),
        { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!apiResponse.ok) {
      console.error('Erro na API ReceitaWS:', apiResponse.status);
      return new Response(
        JSON.stringify({ 
          error: 'Erro ao consultar CNPJ na Receita Federal',
          code: 'API_ERROR'
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiData: ReceitaWSResponse = await apiResponse.json();

    // Verificar se CNPJ foi encontrado
    if (apiData.status === 'ERROR') {
      console.log('CNPJ não encontrado:', apiData.message);
      return new Response(
        JSON.stringify({ 
          error: apiData.message || 'CNPJ não encontrado na Receita Federal',
          code: 'NOT_FOUND'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Montar endereço completo
    const enderecoParts = [
      apiData.logradouro,
      apiData.numero,
      apiData.complemento,
      apiData.bairro,
      apiData.municipio,
      apiData.uf,
      apiData.cep
    ].filter(Boolean);
    const enderecoCompleto = enderecoParts.join(', ');

    // Atividade principal
    const atividadePrincipal = apiData.atividade_principal?.[0]?.text || null;

    // Salvar no cache
    const fornecedorData = {
      cnpj: cnpjLimpo,
      razao_social: apiData.nome || null,
      nome_fantasia: apiData.fantasia || null,
      endereco_completo: enderecoCompleto || null,
      atividade_principal: atividadePrincipal,
      situacao: apiData.situacao || null,
      consultado_em: new Date().toISOString(),
    };

    const { error: insertError } = await supabase
      .from('fornecedores')
      .insert(fornecedorData);

    if (insertError) {
      console.error('Erro ao salvar no cache:', insertError);
      // Continua mesmo se falhar o cache
    } else {
      console.log('CNPJ salvo no cache:', cnpjLimpo);
    }

    return new Response(
      JSON.stringify({
        source: 'api',
        data: {
          cnpj: cnpjLimpo,
          razao_social: apiData.nome,
          nome_fantasia: apiData.fantasia,
          endereco_completo: enderecoCompleto,
          atividade_principal: atividadePrincipal,
          situacao: apiData.situacao,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Erro na função consultar-cnpj:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Erro interno',
        code: 'INTERNAL_ERROR'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
