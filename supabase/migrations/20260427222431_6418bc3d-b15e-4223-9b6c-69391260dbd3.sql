-- ============================================================
-- FUNÇÃO 1: aprovar_solicitacao
-- ============================================================
CREATE OR REPLACE FUNCTION public.aprovar_solicitacao(
  _solicitacao_id uuid,
  _valor_entregue numeric,
  _forma_entrega text,
  _observacoes text,
  _autorizar_excesso boolean,
  _justificativa_excesso text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitacao public.solicitacoes%ROWTYPE;
  v_saldo_anterior numeric;
  v_saldo_posterior numeric;
  v_fundo_id uuid;
  v_user_id uuid := auth.uid();
  v_excede_saldo boolean;
  v_excede_limite boolean;
BEGIN
  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  IF _valor_entregue IS NULL OR _valor_entregue <= 0 THEN
    RAISE EXCEPTION 'Valor entregue deve ser maior que zero';
  END IF;

  SELECT * INTO v_solicitacao
    FROM public.solicitacoes
    WHERE id = _solicitacao_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_solicitacao.status <> 'enviada'::status_solicitacao THEN
    RAISE EXCEPTION 'Solicitação não pode ser aprovada (status atual: %)',
      v_solicitacao.status;
  END IF;

  SELECT id, saldo_atual INTO v_fundo_id, v_saldo_anterior
    FROM public.fundos
    WHERE empresa_id = v_solicitacao.empresa_id
    FOR UPDATE;

  IF v_fundo_id IS NULL THEN
    RAISE EXCEPTION 'Fundo não configurado para esta empresa';
  END IF;

  v_excede_saldo := _valor_entregue > v_saldo_anterior;
  v_excede_limite := _valor_entregue > 300;

  IF (v_excede_saldo OR v_excede_limite) AND NOT _autorizar_excesso THEN
    RAISE EXCEPTION 'Operação requer autorização explícita de excesso';
  END IF;

  IF (v_excede_saldo OR v_excede_limite)
     AND (_justificativa_excesso IS NULL OR length(trim(_justificativa_excesso)) = 0) THEN
    RAISE EXCEPTION 'Justificativa de excesso obrigatória';
  END IF;

  v_saldo_posterior := v_saldo_anterior - _valor_entregue;

  UPDATE public.solicitacoes SET
    status = 'entregue'::status_solicitacao,
    valor_entregue = _valor_entregue,
    forma_entrega = _forma_entrega,
    observacoes_admin = _observacoes,
    admin_aprovador_id = v_user_id,
    data_aprovacao = now(),
    excedeu_saldo = v_excede_saldo,
    excedeu_limite_maximo = v_excede_limite,
    justificativa_excesso_admin = CASE
      WHEN v_excede_saldo OR v_excede_limite THEN _justificativa_excesso
      ELSE NULL
    END
  WHERE id = _solicitacao_id;

  UPDATE public.fundos
    SET saldo_atual = v_saldo_posterior
    WHERE id = v_fundo_id;

  INSERT INTO public.historico_fundos
    (fundo_id, tipo, valor, descricao, admin_id, solicitacao_id,
     saldo_anterior, saldo_posterior)
  VALUES (
    v_fundo_id,
    'saida',
    _valor_entregue,
    CASE
      WHEN v_solicitacao.tipo_solicitacao = 'FUNDO_FIXO'::tipo_solicitacao
        THEN 'Entrega solicitação - ' || left(v_solicitacao.justificativa, 50)
      ELSE 'Adiantamento compra avulsa - ' || left(v_solicitacao.justificativa, 50)
    END,
    v_user_id,
    _solicitacao_id,
    v_saldo_anterior,
    v_saldo_posterior
  );

  INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo)
  VALUES (
    v_solicitacao.solicitante_user_id,
    'Solicitação Aprovada',
    'Sua solicitação de R$ ' || to_char(v_solicitacao.valor_solicitado, 'FM999G999D00') ||
      ' foi aprovada. Valor entregue: R$ ' || to_char(_valor_entregue, 'FM999G999D00'),
    'success'
  );

  RETURN _solicitacao_id;
END $$;

-- ============================================================
-- FUNÇÃO 2: finalizar_baixa
-- ============================================================
CREATE OR REPLACE FUNCTION public.finalizar_baixa(
  _solicitacao_id uuid,
  _valor_gasto_real numeric,
  _descricao_compra text,
  _data_emissao_nota date,
  _numero_nota text,
  _nome_emitente text,
  _cnpj_emitente text,
  _upload_url text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitacao public.solicitacoes%ROWTYPE;
  v_user_id uuid := auth.uid();
  v_fundo_id uuid;
  v_saldo_anterior numeric;
  v_saldo_posterior numeric;
  v_troco_real numeric;
  v_novo_status status_solicitacao;
BEGIN
  IF _valor_gasto_real IS NULL OR _valor_gasto_real <= 0 THEN
    RAISE EXCEPTION 'Valor gasto deve ser maior que zero';
  END IF;

  SELECT * INTO v_solicitacao
    FROM public.solicitacoes
    WHERE id = _solicitacao_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_solicitacao.solicitante_user_id <> v_user_id
     AND NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Sem permissão para finalizar esta baixa';
  END IF;

  IF v_solicitacao.status NOT IN
     ('entregue'::status_solicitacao, 'pendente_ajuste'::status_solicitacao) THEN
    RAISE EXCEPTION 'Solicitação não está em estado de baixa (status: %)',
      v_solicitacao.status;
  END IF;

  v_troco_real := COALESCE(v_solicitacao.valor_entregue, 0) - _valor_gasto_real;
  v_novo_status := CASE
    WHEN v_troco_real < 0 THEN 'pendente_ajuste'::status_solicitacao
    ELSE 'baixada'::status_solicitacao
  END;

  UPDATE public.solicitacoes SET
    status = v_novo_status,
    valor_gasto_real = _valor_gasto_real,
    descricao_compra = _descricao_compra,
    upload_nota_fiscal_url = _upload_url,
    troco_real = v_troco_real,
    data_baixa = now(),
    data_emissao_nota = _data_emissao_nota,
    numero_nota = _numero_nota,
    nome_emitente = _nome_emitente,
    cnpj_emitente = regexp_replace(COALESCE(_cnpj_emitente, ''), '\D', '', 'g')
  WHERE id = _solicitacao_id;

  IF v_troco_real > 0 AND v_novo_status = 'baixada'::status_solicitacao THEN
    SELECT id, saldo_atual INTO v_fundo_id, v_saldo_anterior
      FROM public.fundos
      WHERE empresa_id = v_solicitacao.empresa_id
      FOR UPDATE;

    IF v_fundo_id IS NULL THEN
      RAISE EXCEPTION 'Fundo não encontrado para devolução de troco';
    END IF;

    v_saldo_posterior := v_saldo_anterior + v_troco_real;

    UPDATE public.fundos
      SET saldo_atual = v_saldo_posterior
      WHERE id = v_fundo_id;

    INSERT INTO public.historico_fundos
      (fundo_id, tipo, valor, descricao, solicitacao_id,
       saldo_anterior, saldo_posterior)
    VALUES (
      v_fundo_id,
      'devolucao_troco',
      v_troco_real,
      'Troco devolvido da solicitação ' || _solicitacao_id,
      _solicitacao_id,
      v_saldo_anterior,
      v_saldo_posterior
    );
  END IF;

  RETURN _solicitacao_id;
END $$;

-- ============================================================
-- FUNÇÃO 3: rejeitar_solicitacao
-- ============================================================
CREATE OR REPLACE FUNCTION public.rejeitar_solicitacao(
  _solicitacao_id uuid,
  _motivo text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_solicitacao public.solicitacoes%ROWTYPE;
  v_user_id uuid := auth.uid();
BEGIN
  IF NOT public.has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Acesso negado: apenas administradores';
  END IF;

  IF _motivo IS NULL OR length(trim(_motivo)) = 0 THEN
    RAISE EXCEPTION 'Motivo da rejeição é obrigatório';
  END IF;

  SELECT * INTO v_solicitacao
    FROM public.solicitacoes
    WHERE id = _solicitacao_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Solicitação não encontrada';
  END IF;

  IF v_solicitacao.status <> 'enviada'::status_solicitacao THEN
    RAISE EXCEPTION 'Solicitação não pode ser rejeitada (status atual: %)',
      v_solicitacao.status;
  END IF;

  UPDATE public.solicitacoes SET
    status = 'rejeitada'::status_solicitacao,
    motivo_rejeicao = _motivo,
    admin_aprovador_id = v_user_id,
    data_aprovacao = now()
  WHERE id = _solicitacao_id;

  INSERT INTO public.notificacoes (user_id, titulo, mensagem, tipo)
  VALUES (
    v_solicitacao.solicitante_user_id,
    'Solicitação Rejeitada',
    'Sua solicitação foi rejeitada. Motivo: ' || _motivo,
    'error'
  );

  RETURN _solicitacao_id;
END $$;

-- ============================================================
-- GRANTS
-- ============================================================
GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao(uuid, numeric, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_baixa(uuid, numeric, text, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_solicitacao(uuid, text) TO authenticated;
