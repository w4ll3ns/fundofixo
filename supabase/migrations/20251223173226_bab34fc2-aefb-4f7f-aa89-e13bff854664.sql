-- Criar tabela de cache de fornecedores consultados via ReceitaWS
CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cnpj TEXT NOT NULL UNIQUE,
  razao_social TEXT,
  nome_fantasia TEXT,
  endereco_completo TEXT,
  atividade_principal TEXT,
  situacao TEXT,
  consultado_em TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para buscas rápidas por CNPJ
CREATE INDEX idx_fornecedores_cnpj ON public.fornecedores(cnpj);

-- Habilitar RLS
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

-- Admins podem gerenciar fornecedores
CREATE POLICY "Admins podem gerenciar fornecedores"
ON public.fornecedores
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Usuários autenticados podem visualizar fornecedores
CREATE POLICY "Usuários autenticados podem visualizar fornecedores"
ON public.fornecedores
FOR SELECT
USING (true);