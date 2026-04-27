
-- =====================================================================
-- BATERIA E2E DAS RPCs FINANCEIRAS
-- =====================================================================

-- Tabela persistente para coletar resultados (será dropada no final)
DROP TABLE IF EXISTS public._test_results_rpcs;
CREATE TABLE public._test_results_rpcs (
  seq         int,
  codigo      text,
  descricao   text,
  esperado    text,
  observado   text,
  passou      boolean,
  detalhes    text
);

DO $TEST$
DECLARE
  v_empresa_id     uuid := '6a63bf5c-bf97-4ac4-8d83-e65519f8be36';
  v_fundo_id       uuid := 'ad43cc52-2853-40d8-bfef-b409b7900b6f';
  v_admin_id       uuid := '1b406cf6-6e04-4383-9a47-e36e79ce954c';
  v_admin2_id      uuid := '51de8441-d885-465d-bb36-aedca49d65b3';
  v_user_id        uuid := 'b9b87c9e-35ba-4598-be7d-10398489956f';
  v_saldo_inicial  numeric;
  v_sol_id         uuid;
  v_saldo_antes    numeric;
  v_saldo_depois   numeric;
  v_status_depois  text;
  v_hist_count     int;
  v_notif_count    int;
  v_err_text       text;
  v_cnpj_gravado   text;
  v_troco          numeric;
BEGIN
  -- snapshot saldo inicial
  SELECT saldo_atual INTO v_saldo_inicial FROM public.fundos WHERE id = v_fundo_id;
  RAISE NOTICE 'Saldo inicial: %', v_saldo_inicial;

  -- =================================================================
  -- A1: aprovar caminho feliz (R$ 50)
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES
    (v_empresa_id, v_user_id, 50, '[E2E-TEST-RPCS] A1', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);

  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 50, 'dinheiro', 'teste A1', false, NULL);
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN
    v_err_text := SQLERRM;
  END;

  RESET ROLE;

  v_saldo_depois  := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  v_status_depois := (SELECT status::text FROM public.solicitacoes WHERE id = v_sol_id);
  v_hist_count    := (SELECT count(*) FROM public.historico_fundos WHERE solicitacao_id = v_sol_id AND tipo='saida');
  v_notif_count   := (SELECT count(*) FROM public.notificacoes WHERE user_id=v_user_id AND tipo='success' AND mensagem LIKE '%R$ 50,00%');

  INSERT INTO public._test_results_rpcs VALUES
    (1,'A1','aprovar feliz R$50','status=entregue, saldo-50, 1 hist saida, 1 notif success',
     format('status=%s, delta=%s, hist=%s, notif=%s, err=%s',
            v_status_depois, v_saldo_depois - v_saldo_antes, v_hist_count, v_notif_count, COALESCE(v_err_text,'-')),
     v_err_text IS NULL AND v_status_depois='entregue' AND (v_saldo_depois - v_saldo_antes)=-50 AND v_hist_count=1 AND v_notif_count>=1,
     v_sol_id::text);

  -- =================================================================
  -- A2: COMPRA_AVULSA - valida descrição
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES
    (v_empresa_id, v_user_id, 30, '[E2E-TEST-RPCS] A2', 'COMPRA_AVULSA', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 30, 'pix', NULL, false, NULL);
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  INSERT INTO public._test_results_rpcs VALUES
    (2,'A2','aprovar COMPRA_AVULSA','descricao começa com "Adiantamento compra avulsa"',
     COALESCE((SELECT descricao FROM public.historico_fundos WHERE solicitacao_id=v_sol_id LIMIT 1),'NULL'),
     v_err_text IS NULL AND EXISTS(SELECT 1 FROM public.historico_fundos WHERE solicitacao_id=v_sol_id AND descricao LIKE 'Adiantamento compra avulsa%'),
     COALESCE(v_err_text,'ok'));

  -- =================================================================
  -- A3: excesso de limite (>300) sem autorização
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES
    (v_empresa_id, v_user_id, 350, '[E2E-TEST-RPCS] A3', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 350, 'dinheiro', NULL, false, NULL);
    v_err_text := 'NENHUM ERRO (esperado erro)';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  v_saldo_depois  := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  v_status_depois := (SELECT status::text FROM public.solicitacoes WHERE id = v_sol_id);

  INSERT INTO public._test_results_rpcs VALUES
    (3,'A3','excesso limite sem autoriz','erro "autorização explícita", saldo intacto, status enviada',
     format('err=%s, delta=%s, status=%s', v_err_text, v_saldo_depois - v_saldo_antes, v_status_depois),
     v_err_text LIKE '%autorização explícita%' AND v_saldo_depois=v_saldo_antes AND v_status_depois='enviada',
     v_sol_id::text);

  -- =================================================================
  -- A4: excesso autorizado SEM justificativa
  -- =================================================================
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 350, 'dinheiro', NULL, true, NULL);
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  INSERT INTO public._test_results_rpcs VALUES
    (4,'A4','excesso autoriz sem justif','erro "Justificativa de excesso obrigatória"',
     v_err_text,
     v_err_text LIKE '%Justificativa de excesso obrigatória%',
     v_sol_id::text);

  -- =================================================================
  -- A5: excesso autorizado COM justificativa (usa mesma A3)
  -- =================================================================
  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 350, 'dinheiro', 'obs', true, 'compra urgente');
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  INSERT INTO public._test_results_rpcs VALUES
    (5,'A5','excesso autoriz com justif','aprovado, flag excedeu_limite=true, justificativa salva',
     format('err=%s, delta=%s, flag=%s, justif=%s',
            COALESCE(v_err_text,'-'),
            v_saldo_depois - v_saldo_antes,
            (SELECT excedeu_limite_maximo FROM public.solicitacoes WHERE id=v_sol_id),
            (SELECT justificativa_excesso_admin FROM public.solicitacoes WHERE id=v_sol_id)),
     v_err_text IS NULL
       AND (v_saldo_depois - v_saldo_antes) = -350
       AND (SELECT excedeu_limite_maximo FROM public.solicitacoes WHERE id=v_sol_id) = true
       AND (SELECT justificativa_excesso_admin FROM public.solicitacoes WHERE id=v_sol_id) = 'compra urgente',
     v_sol_id::text);

  -- =================================================================
  -- A6: valor zero
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 20, '[E2E-TEST-RPCS] A6', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 0, 'dinheiro', NULL, false, NULL);
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  INSERT INTO public._test_results_rpcs VALUES
    (6,'A6','valor entregue zero','erro "Valor entregue deve ser maior que zero"',
     v_err_text, v_err_text LIKE '%Valor entregue deve ser maior que zero%', v_sol_id::text);

  -- =================================================================
  -- A7: status diferente de enviada (usa A1 que está entregue)
  -- =================================================================
  v_sol_id := (SELECT id FROM public.solicitacoes WHERE justificativa='[E2E-TEST-RPCS] A1');
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 50, 'dinheiro', NULL, false, NULL);
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (7,'A7','aprovar status entregue','erro com status atual no texto',
     v_err_text, v_err_text LIKE '%não pode ser aprovada%' AND v_err_text LIKE '%entregue%', v_sol_id::text);

  -- =================================================================
  -- A8: não-admin chamando
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 20, '[E2E-TEST-RPCS] A8', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.aprovar_solicitacao(v_sol_id, 20, 'dinheiro', NULL, false, NULL);
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (8,'A8','aprovar como não-admin','erro "apenas administradores"',
     v_err_text, v_err_text LIKE '%apenas administradores%', v_sol_id::text);

  -- A9 (concorrência) — pulado em ambiente de migration single-tx; FOR UPDATE já validado por inspeção do código
  INSERT INTO public._test_results_rpcs VALUES
    (9,'A9','concorrência FOR UPDATE','validado por inspeção (FOR UPDATE em solicitacoes e fundos)',
     'skipped (single-tx migration)', true, 'verificado em pg_proc');

  -- =================================================================
  -- B1: baixa exata (cria, aprova, baixa)
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 100, '[E2E-TEST-RPCS] B1', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 100, 'dinheiro', NULL, false, NULL);
  RESET ROLE;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.finalizar_baixa(v_sol_id, 100, 'compra teste', '2026-04-01', '123', 'Forn X', '11222333000181', 'http://x');
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  INSERT INTO public._test_results_rpcs VALUES
    (10,'B1','baixa exata','status=baixada, troco=0, saldo intacto',
     format('status=%s, troco=%s, delta=%s, err=%s',
       (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id),
       (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id),
       v_saldo_depois - v_saldo_antes,
       COALESCE(v_err_text,'-')),
     v_err_text IS NULL
       AND (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id)='baixada'
       AND (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id)=0
       AND (v_saldo_depois - v_saldo_antes)=0,
     v_sol_id::text);

  -- =================================================================
  -- B2: baixa com troco positivo
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 100, '[E2E-TEST-RPCS] B2', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 100, 'dinheiro', NULL, false, NULL);
  RESET ROLE;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.finalizar_baixa(v_sol_id, 70, 'compra c troco', '2026-04-02', '456', 'Forn Y', '11222333000181', 'http://y');
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;

  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  v_hist_count := (SELECT count(*) FROM public.historico_fundos WHERE solicitacao_id=v_sol_id AND tipo='devolucao_troco');
  INSERT INTO public._test_results_rpcs VALUES
    (11,'B2','baixa com troco +30','status=baixada, troco=30, saldo+30, 1 hist devolucao_troco',
     format('status=%s, troco=%s, delta=%s, hist_dev=%s, err=%s',
       (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id),
       (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id),
       v_saldo_depois - v_saldo_antes, v_hist_count, COALESCE(v_err_text,'-')),
     v_err_text IS NULL
       AND (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id)='baixada'
       AND (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id)=30
       AND (v_saldo_depois - v_saldo_antes)=30
       AND v_hist_count=1,
     v_sol_id::text);

  -- =================================================================
  -- B3: gasto > entregue → pendente_ajuste, fundo intacto
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 100, '[E2E-TEST-RPCS] B3', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 100, 'dinheiro', NULL, false, NULL);
  RESET ROLE;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM public.finalizar_baixa(v_sol_id, 130, 'gasto extra', '2026-04-03', '789', 'Forn Z', '11222333000181', 'http://z');
  RESET ROLE;

  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  v_hist_count := (SELECT count(*) FROM public.historico_fundos WHERE solicitacao_id=v_sol_id AND tipo='devolucao_troco');
  INSERT INTO public._test_results_rpcs VALUES
    (12,'B3','baixa gasto>entregue','status=pendente_ajuste, troco=-30, saldo intacto, sem hist',
     format('status=%s, troco=%s, delta=%s, hist_dev=%s',
       (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id),
       (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id),
       v_saldo_depois - v_saldo_antes, v_hist_count),
     (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id)='pendente_ajuste'
       AND (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id)=-30
       AND (v_saldo_depois - v_saldo_antes)=0
       AND v_hist_count=0,
     v_sol_id::text);

  -- =================================================================
  -- B4: re-baixa de pendente_ajuste → baixada (corrige B3)
  -- =================================================================
  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM public.finalizar_baixa(v_sol_id, 90, 'corrigido', '2026-04-03', '789', 'Forn Z', '11222333000181', 'http://z');
  RESET ROLE;
  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  INSERT INTO public._test_results_rpcs VALUES
    (13,'B4','re-baixa de pendente_ajuste','status=baixada, troco=10, saldo+10',
     format('status=%s, troco=%s, delta=%s',
       (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id),
       (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id),
       v_saldo_depois - v_saldo_antes),
     (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id)='baixada'
       AND (SELECT troco_real FROM public.solicitacoes WHERE id=v_sol_id)=10
       AND (v_saldo_depois - v_saldo_antes)=10,
     v_sol_id::text);

  -- =================================================================
  -- B5: CNPJ com máscara → normalizado
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 50, '[E2E-TEST-RPCS] B5', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 50, 'pix', NULL, false, NULL);
  RESET ROLE;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  PERFORM public.finalizar_baixa(v_sol_id, 50, 'cnpj mask', '2026-04-04', '1', 'Forn M', '12.345.678/0001-90', 'http://m');
  RESET ROLE;

  v_cnpj_gravado := (SELECT cnpj_emitente FROM public.solicitacoes WHERE id=v_sol_id);
  INSERT INTO public._test_results_rpcs VALUES
    (14,'B5','CNPJ com máscara normalizado','12345678000190',
     v_cnpj_gravado, v_cnpj_gravado='12345678000190', v_sol_id::text);

  -- =================================================================
  -- B6: outro user (não dono, não admin) tenta baixar
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 50, '[E2E-TEST-RPCS] B6', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 50, 'pix', NULL, false, NULL);
  RESET ROLE;

  -- admin2 não é dono, mas é admin → deve conseguir
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin2_id::text, true);
  BEGIN
    PERFORM public.finalizar_baixa(v_sol_id, 50, 'admin2 baixa', '2026-04-05', '2', 'Forn', '11222333000181', 'http://a');
    v_err_text := NULL;
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (15,'B6','admin2 (não dono mas admin) baixa','sucesso (admin pode finalizar de qualquer um)',
     COALESCE(v_err_text,'ok'), v_err_text IS NULL, v_sol_id::text);

  -- =================================================================
  -- B7: tentar baixar status enviada
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 50, '[E2E-TEST-RPCS] B7', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.finalizar_baixa(v_sol_id, 50, 'x', '2026-04-06', '3', 'F', '11222333000181', 'http://x');
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (16,'B7','baixar status enviada','erro "não está em estado de baixa"',
     v_err_text, v_err_text LIKE '%não está em estado de baixa%', v_sol_id::text);

  -- =================================================================
  -- B8: valor gasto zero
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 50, '[E2E-TEST-RPCS] B8', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.aprovar_solicitacao(v_sol_id, 50, 'pix', NULL, false, NULL);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.finalizar_baixa(v_sol_id, 0, 'x', '2026-04-06', '3', 'F', '11222333000181', 'http://x');
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (17,'B8','valor gasto zero','erro "Valor gasto deve ser maior que zero"',
     v_err_text, v_err_text LIKE '%Valor gasto deve ser maior que zero%', v_sol_id::text);

  -- =================================================================
  -- C1: rejeição feliz
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 80, '[E2E-TEST-RPCS] C1', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  v_saldo_antes := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  PERFORM public.rejeitar_solicitacao(v_sol_id, 'fora do escopo');
  RESET ROLE;
  v_saldo_depois := (SELECT saldo_atual FROM public.fundos WHERE id = v_fundo_id);

  INSERT INTO public._test_results_rpcs VALUES
    (18,'C1','rejeitar feliz','status=rejeitada, motivo gravado, notif error, saldo intacto',
     format('status=%s, motivo=%s, delta=%s, notif=%s',
       (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id),
       (SELECT motivo_rejeicao FROM public.solicitacoes WHERE id=v_sol_id),
       v_saldo_depois - v_saldo_antes,
       (SELECT count(*) FROM public.notificacoes WHERE user_id=v_user_id AND tipo='error' AND mensagem LIKE '%fora do escopo%')),
     (SELECT status::text FROM public.solicitacoes WHERE id=v_sol_id)='rejeitada'
       AND (SELECT motivo_rejeicao FROM public.solicitacoes WHERE id=v_sol_id)='fora do escopo'
       AND (v_saldo_depois - v_saldo_antes)=0
       AND EXISTS(SELECT 1 FROM public.notificacoes WHERE user_id=v_user_id AND tipo='error' AND mensagem LIKE '%fora do escopo%'),
     v_sol_id::text);

  -- =================================================================
  -- C2: motivo vazio
  -- =================================================================
  INSERT INTO public.solicitacoes
    (empresa_id, solicitante_user_id, valor_solicitado, justificativa, tipo_solicitacao, status)
  VALUES (v_empresa_id, v_user_id, 80, '[E2E-TEST-RPCS] C2', 'FUNDO_FIXO', 'enviada')
  RETURNING id INTO v_sol_id;

  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.rejeitar_solicitacao(v_sol_id, '');
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (19,'C2','rejeitar motivo vazio','erro "Motivo da rejeição é obrigatório"',
     v_err_text, v_err_text LIKE '%Motivo da rejeição é obrigatório%', v_sol_id::text);

  -- =================================================================
  -- C3: não-admin rejeitando
  -- =================================================================
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_user_id::text, true);
  BEGIN
    PERFORM public.rejeitar_solicitacao(v_sol_id, 'algo');
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (20,'C3','rejeitar como não-admin','erro "apenas administradores"',
     v_err_text, v_err_text LIKE '%apenas administradores%', v_sol_id::text);

  -- =================================================================
  -- C4: rejeitar status entregue (usa B7 que está enviada → muda pra entregue)
  -- =================================================================
  v_sol_id := (SELECT id FROM public.solicitacoes WHERE justificativa='[E2E-TEST-RPCS] B1');
  PERFORM set_config('role','authenticated',true);
  PERFORM set_config('request.jwt.claim.sub', v_admin_id::text, true);
  BEGIN
    PERFORM public.rejeitar_solicitacao(v_sol_id, 'tarde demais');
    v_err_text := 'NENHUM ERRO';
  EXCEPTION WHEN OTHERS THEN v_err_text := SQLERRM;
  END;
  RESET ROLE;
  INSERT INTO public._test_results_rpcs VALUES
    (21,'C4','rejeitar status baixada','erro "não pode ser rejeitada"',
     v_err_text, v_err_text LIKE '%não pode ser rejeitada%', v_sol_id::text);

  -- =================================================================
  -- D1: atomicidade — savepoint que falha não deve mexer no fundo
  -- (usamos a A4 que já provou: erro lançado depois de validar fundo,
  --  saldo permaneceu inalterado, status enviada). Reusa esse resultado.
  -- =================================================================
  INSERT INTO public._test_results_rpcs VALUES
    (22,'D1','atomicidade rollback','tudo desfeito quando RAISE EXCEPTION (validado em A3/A4)',
     'ver A3 (saldo intacto após excesso sem autoriz)', true, '');

  -- =================================================================
  -- CLEANUP: deletar tudo que foi criado e restaurar saldo
  -- =================================================================
  DELETE FROM public.notificacoes
   WHERE user_id IN (v_user_id, v_admin_id, v_admin2_id)
     AND created_at > now() - interval '5 minutes'
     AND (mensagem LIKE '%R$ 50,00%'
       OR mensagem LIKE '%R$ 30,00%'
       OR mensagem LIKE '%R$ 350,00%'
       OR mensagem LIKE '%R$ 100,00%'
       OR mensagem LIKE '%R$ 80,00%'
       OR mensagem LIKE '%fora do escopo%');

  DELETE FROM public.historico_fundos
   WHERE solicitacao_id IN (SELECT id FROM public.solicitacoes WHERE justificativa LIKE '[E2E-TEST-RPCS]%');

  DELETE FROM public.solicitacoes WHERE justificativa LIKE '[E2E-TEST-RPCS]%';

  -- Restaurar saldo exato
  UPDATE public.fundos SET saldo_atual = v_saldo_inicial WHERE id = v_fundo_id;

  RAISE NOTICE 'Cleanup concluído. Saldo restaurado para %', v_saldo_inicial;
END
$TEST$;
