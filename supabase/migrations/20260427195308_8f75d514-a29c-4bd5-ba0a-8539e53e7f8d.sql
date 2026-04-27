CREATE TABLE public.solicitacao_notas (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  solicitacao_id UUID NOT NULL REFERENCES public.solicitacoes(id) ON DELETE CASCADE,
  valor NUMERIC NOT NULL CHECK (valor > 0),
  upload_url TEXT NOT NULL,
  arquivo_hash TEXT,
  data_emissao DATE,
  numero_nota TEXT,
  nome_emitente TEXT,
  cnpj_emitente TEXT,
  descricao TEXT,
  ai_valor_extraido NUMERIC,
  ai_confianca public.nivel_confianca,
  ai_evidencia TEXT,
  ai_status public.ai_status,
  ai_processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_solicitacao_notas_solicitacao_id ON public.solicitacao_notas(solicitacao_id);
CREATE INDEX idx_solicitacao_notas_arquivo_hash ON public.solicitacao_notas(arquivo_hash);

ALTER TABLE public.solicitacao_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View notas: owner, admin or consultivo"
ON public.solicitacao_notas
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR solicitacao_id IN (SELECT id FROM public.solicitacoes WHERE solicitante_user_id = auth.uid())
  OR solicitacao_id IN (
    SELECT s.id FROM public.solicitacoes s
    WHERE s.empresa_id IN (SELECT empresa_id FROM public.usuario_empresa_acesso WHERE user_id = auth.uid())
  )
);

CREATE POLICY "Insert notas: owner allowed status or admin"
ON public.solicitacao_notas
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR solicitacao_id IN (
    SELECT id FROM public.solicitacoes
    WHERE solicitante_user_id = auth.uid()
      AND status IN ('entregue'::status_solicitacao, 'pendente_ajuste'::status_solicitacao)
  )
);

CREATE POLICY "Update notas: owner allowed status or admin"
ON public.solicitacao_notas
FOR UPDATE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR solicitacao_id IN (
    SELECT id FROM public.solicitacoes
    WHERE solicitante_user_id = auth.uid()
      AND status IN ('entregue'::status_solicitacao, 'pendente_ajuste'::status_solicitacao)
  )
);

CREATE POLICY "Delete notas: owner allowed status or admin"
ON public.solicitacao_notas
FOR DELETE
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR solicitacao_id IN (
    SELECT id FROM public.solicitacoes
    WHERE solicitante_user_id = auth.uid()
      AND status IN ('entregue'::status_solicitacao, 'pendente_ajuste'::status_solicitacao)
  )
);