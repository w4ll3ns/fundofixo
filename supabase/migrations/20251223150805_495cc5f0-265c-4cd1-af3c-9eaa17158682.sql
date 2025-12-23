-- Criar ENUM para tipo de solicitação
CREATE TYPE tipo_solicitacao AS ENUM ('FUNDO_FIXO', 'COMPRA_AVULSA');

-- Adicionar novas colunas na tabela solicitacoes
ALTER TABLE public.solicitacoes 
ADD COLUMN tipo_solicitacao tipo_solicitacao NOT NULL DEFAULT 'FUNDO_FIXO',
ADD COLUMN excedeu_saldo BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN excedeu_limite_maximo BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN justificativa_excesso_admin TEXT;

-- Criar tabela de histórico de fundos
CREATE TABLE public.historico_fundos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fundo_id UUID NOT NULL REFERENCES public.fundos(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('entrada', 'saida')),
  valor NUMERIC NOT NULL,
  descricao TEXT,
  admin_id UUID,
  solicitacao_id UUID REFERENCES public.solicitacoes(id) ON DELETE SET NULL,
  saldo_anterior NUMERIC NOT NULL,
  saldo_posterior NUMERIC NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Habilitar RLS na tabela historico_fundos
ALTER TABLE public.historico_fundos ENABLE ROW LEVEL SECURITY;

-- Políticas RLS para historico_fundos
CREATE POLICY "Admins can manage historico_fundos"
ON public.historico_fundos
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view historico of their solicitacoes"
ON public.historico_fundos
FOR SELECT
USING (
  solicitacao_id IN (
    SELECT id FROM public.solicitacoes WHERE solicitante_user_id = auth.uid()
  )
);

-- Trigger para atualizar updated_at na tabela historico_fundos
CREATE TRIGGER update_historico_fundos_updated_at
BEFORE UPDATE ON public.historico_fundos
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();