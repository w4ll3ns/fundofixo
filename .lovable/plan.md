## Etapa 4 — Criar 3 RPCs financeiras transacionais (somente DB)

Criar **uma única migration** `rpc_financeiras_aprovar_baixar_rejeitar` contendo as três funções PL/pgSQL exatamente como você especificou, mais os GRANTs. Nenhum arquivo do front será tocado.

## O que será criado

### 1. `public.aprovar_solicitacao(uuid, numeric, text, text, boolean, text) → uuid`
- `SECURITY DEFINER`, `search_path = public`
- Valida `has_role(admin)` e valor > 0
- `SELECT ... FOR UPDATE` na solicitação (status deve ser `enviada`) e no fundo da empresa → elimina race condition entre admins
- Calcula `excedeu_saldo` / `excedeu_limite` (>300); exige `_autorizar_excesso=true` + `_justificativa_excesso` quando aplicável
- Atomicamente: UPDATE `solicitacoes` (status `entregue`, dados de aprovação, flags de excesso) + UPDATE `fundos.saldo_atual` + INSERT `historico_fundos` (`tipo='saida'`, descrição diferenciada por `tipo_solicitacao`) + INSERT `notificacoes` (sucesso) para o solicitante

### 2. `public.finalizar_baixa(uuid, numeric, text, date, text, text, text, text) → uuid`
- `SECURITY DEFINER`, `search_path = public`
- Permissão: dono da solicitação OU admin
- Status atual deve ser `entregue` ou `pendente_ajuste`
- `FOR UPDATE` na solicitação; calcula `troco_real = valor_entregue - valor_gasto_real`
- Novo status: `pendente_ajuste` se troco < 0, senão `baixada`
- UPDATE da solicitação com dados da nota (CNPJ normalizado via `regexp_replace`)
- Se `troco_real > 0` E status = `baixada`: `FOR UPDATE` no fundo, UPDATE `saldo_atual += troco`, INSERT `historico_fundos` (`tipo='devolucao_troco'`)
- Em `pendente_ajuste` NÃO mexe no fundo

### 3. `public.rejeitar_solicitacao(uuid, text) → uuid`
- `SECURITY DEFINER`, `search_path = public`
- Valida admin + motivo não vazio + status `enviada`
- UPDATE solicitação para `rejeitada` + INSERT `notificacoes` (`error`) para o solicitante
- Não mexe no fundo (nada foi entregue)

### GRANTs
```
GRANT EXECUTE ON FUNCTION public.aprovar_solicitacao(uuid, numeric, text, text, boolean, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.finalizar_baixa(uuid, numeric, text, date, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rejeitar_solicitacao(uuid, text) TO authenticated;
```

## Garantias técnicas

- **Atomicidade**: tudo dentro de uma única transação implícita do RPC; qualquer `RAISE EXCEPTION` faz rollback completo (resolve estados inconsistentes atuais).
- **Concorrência**: `SELECT ... FOR UPDATE` em `solicitacoes` e `fundos` serializa admins concorrentes (resolve sobrescrita de saldo).
- **Compatível com schema atual**:
  - `historico_fundos.tipo` aceita `'saida'` e `'devolucao_troco'` (memória `historico-fundos-transaction-types`).
  - Nova policy de `notificacoes` permite INSERT por admin (RPC roda como `SECURITY DEFINER`, mas a policy de admin/self também cobre).
  - Trigger `trg_empresa_criar_fundo` garante que `fundos` existe; ainda assim mantemos o check defensivo.
  - CHECK `valor_solicitado > 0` não é tocado; valores entregue/gasto validados por `RAISE EXCEPTION`.

## Pós-migration (verificação)

Rodar via `supabase--read_query`:
```sql
SELECT proname, pg_get_function_identity_arguments(oid) AS args
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN ('aprovar_solicitacao','finalizar_baixa','rejeitar_solicitacao');

SELECT routine_name, grantee, privilege_type
FROM information_schema.routine_privileges
WHERE routine_schema = 'public'
  AND routine_name IN ('aprovar_solicitacao','finalizar_baixa','rejeitar_solicitacao')
  AND grantee = 'authenticated';
```
Esperado: 3 linhas em `pg_proc`, 3 grants `EXECUTE` para `authenticated`.

## Fora de escopo (não vou fazer)

- Nenhuma alteração em `src/` (TS/React/CSS).
- Nenhuma chamada dessas RPCs do front — você vai validar manualmente no SQL Editor antes da migração do front.
- Nada de `importar_notas_lote` — fica para outra etapa.
- Nenhuma policy/função existente removida ou modificada.
