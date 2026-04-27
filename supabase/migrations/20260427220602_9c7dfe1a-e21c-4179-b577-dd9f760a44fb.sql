-- 1. RLS notificacoes
DROP POLICY IF EXISTS "System can insert notifications" ON public.notificacoes;

CREATE POLICY "Only admin or self can insert notifications"
  ON public.notificacoes FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::app_role)
  );

-- 2. RLS solicitacoes UPDATE com WITH CHECK
DROP POLICY IF EXISTS "Users can update own solicitacoes when allowed" ON public.solicitacoes;

CREATE POLICY "Users can update own solicitacoes when allowed"
  ON public.solicitacoes FOR UPDATE
  TO authenticated
  USING (
    solicitante_user_id = auth.uid()
    AND status IN ('entregue'::status_solicitacao, 'pendente_ajuste'::status_solicitacao)
  )
  WITH CHECK (
    solicitante_user_id = auth.uid()
  );

-- 3. UNIQUE em empresas.cnpj
ALTER TABLE public.empresas
  ADD CONSTRAINT empresas_cnpj_unique UNIQUE (cnpj);

-- 4. CHECK valor positivo
ALTER TABLE public.solicitacoes
  ADD CONSTRAINT chk_valor_solicitado_positivo
  CHECK (valor_solicitado > 0);

-- 5. Trigger criar fundo ao criar empresa
CREATE OR REPLACE FUNCTION public.criar_fundo_empresa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.fundos (empresa_id, saldo_atual)
  VALUES (NEW.id, 0)
  ON CONFLICT (empresa_id) DO NOTHING;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_empresa_criar_fundo ON public.empresas;
CREATE TRIGGER trg_empresa_criar_fundo
  AFTER INSERT ON public.empresas
  FOR EACH ROW EXECUTE FUNCTION public.criar_fundo_empresa();

-- 6. Back-fill de fundos para empresas legadas
INSERT INTO public.fundos (empresa_id, saldo_atual)
SELECT e.id, 0
FROM public.empresas e
WHERE NOT EXISTS (
  SELECT 1 FROM public.fundos f WHERE f.empresa_id = e.id
)
ON CONFLICT (empresa_id) DO NOTHING;