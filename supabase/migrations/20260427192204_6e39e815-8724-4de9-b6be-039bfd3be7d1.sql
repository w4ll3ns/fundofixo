ALTER TABLE public.historico_fundos DROP CONSTRAINT IF EXISTS historico_fundos_tipo_check;
ALTER TABLE public.historico_fundos ADD CONSTRAINT historico_fundos_tipo_check
  CHECK (tipo = ANY (ARRAY['entrada','saida','solicitacao_retroativa','baixa','ajuste','devolucao_troco']));

DO $$
DECLARE
  v_fundo_id uuid := 'ad43cc52-2853-40d8-bfef-b409b7900b6f';
  v_solicitacao_id uuid := 'e7107bef-584f-4e7e-baa6-dada40128d21';
  v_saldo_atual numeric;
  v_saldo_apos_saida numeric;
  v_saldo_final numeric;
BEGIN
  SELECT saldo_atual INTO v_saldo_atual FROM public.fundos WHERE id = v_fundo_id;
  v_saldo_apos_saida := v_saldo_atual - 300;
  v_saldo_final := v_saldo_apos_saida + 189.40;

  INSERT INTO public.historico_fundos (fundo_id, solicitacao_id, tipo, valor, saldo_anterior, saldo_posterior, descricao)
  VALUES
    (v_fundo_id, v_solicitacao_id, 'saida', 300, v_saldo_atual, v_saldo_apos_saida, 'Ajuste retroativo: adiantamento compra avulsa - TESTE DO VALOR'),
    (v_fundo_id, v_solicitacao_id, 'devolucao_troco', 189.40, v_saldo_apos_saida, v_saldo_final, 'Ajuste retroativo: troco compra avulsa - TESTE DO VALOR');

  UPDATE public.fundos SET saldo_atual = v_saldo_final WHERE id = v_fundo_id;
END $$;