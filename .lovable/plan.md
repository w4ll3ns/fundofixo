# Etapa 5 — Teste E2E das RPCs financeiras (somente DB, sem mexer no front)

Vou rodar uma bateria de testes diretamente no Postgres (via `supabase--read_query` para SELECTs e via **uma migration de teste isolada** para os SETs de role/transações), validando os 3 RPCs criados na Etapa 4 em todos os caminhos: feliz, validações, erros de permissão, race condition e rollback.

Importante: **nada em `src/` será tocado.** Todas as mudanças de dados feitas no teste serão revertidas ao final por uma segunda migration de cleanup, deixando o banco no mesmo estado inicial.

## Cenário de teste

Dados existentes que serão usados:
- **Empresa**: `OXYGENI HUB` (id `6a63bf5c…`), fundo com saldo atual **R$ 1.668,92**
- **Admin**: Wallen Santiago (`1b406cf6…`)
- **Usuário comum**: Wallen Santiago Usuario (`b9b87c9e…`)

Para cada teste, simulo o usuário autenticado com:
```sql
SET LOCAL ROLE authenticated;
SET LOCAL "request.jwt.claim.sub" = '<user_uuid>';
```
Isso faz `auth.uid()` retornar o UUID escolhido, replicando o comportamento real do front.

## Testes que vou executar

### Bloco A — `aprovar_solicitacao`
1. **A1 — Caminho feliz** (valor R$ 50, dentro do saldo e do limite): cria solicitação `enviada`, chama RPC como admin. Espera: status `entregue`, fundo debitado em 50, 1 linha em `historico_fundos` (`tipo='saida'`), 1 notificação `success` para o solicitante.
2. **A2 — Tipo COMPRA_AVULSA**: mesma coisa, mas valida que a descrição em `historico_fundos` começa com `'Adiantamento compra avulsa'`.
3. **A3 — Excesso de limite (>R$ 300) sem autorização**: espera `RAISE EXCEPTION 'Operação requer autorização explícita de excesso'` e **rollback completo** (saldo intacto, status ainda `enviada`).
4. **A4 — Excesso autorizado mas sem justificativa**: espera erro `'Justificativa de excesso obrigatória'`.
5. **A5 — Excesso autorizado com justificativa**: aprova; valida flags `excedeu_limite_maximo=true` e `justificativa_excesso_admin` preenchida.
6. **A6 — Valor zero/negativo**: erro `'Valor entregue deve ser maior que zero'`.
7. **A7 — Status diferente de `enviada`**: tenta aprovar uma já `entregue` → erro com status atual no texto.
8. **A8 — Não-admin chamando**: como user comum → erro `'Acesso negado: apenas administradores'`.
9. **A9 — Concorrência (`FOR UPDATE`)**: abre 2 transações que tentam aprovar a mesma solicitação simultaneamente; a segunda deve bloquear até a primeira commitar e então falhar com erro de status (validação serializada). Vou simular com `pg_sleep` dentro de uma transação e medir.

### Bloco B — `finalizar_baixa`
10. **B1 — Baixa exata** (`valor_gasto = valor_entregue`): status vai a `baixada`, `troco_real=0`, fundo intacto.
11. **B2 — Baixa com troco positivo**: status `baixada`, `troco_real>0`, fundo creditado, 1 linha `historico_fundos` (`tipo='devolucao_troco'`).
12. **B3 — Baixa com gasto > entregue**: status `pendente_ajuste`, `troco_real<0`, fundo **NÃO** alterado, **nenhuma** linha em historico.
13. **B4 — Re-baixa de `pendente_ajuste` para `baixada`**: corrige valores; valida transição.
14. **B5 — CNPJ com máscara**: passa `12.345.678/0001-90`; valida que ficou gravado como `12345678000190` (regex aplicado).
15. **B6 — Permissão**: outro user comum (não dono, não admin) → erro `'Sem permissão para finalizar esta baixa'`.
16. **B7 — Status inválido**: tenta baixar uma `enviada` ou `rejeitada` → erro.
17. **B8 — Valor gasto zero/negativo**: erro `'Valor gasto deve ser maior que zero'`.

### Bloco C — `rejeitar_solicitacao`
18. **C1 — Rejeição feliz**: admin rejeita `enviada` com motivo. Status vira `rejeitada`, `motivo_rejeicao` preenchido, notificação `error` criada, fundo **intacto**.
19. **C2 — Motivo vazio/nulo**: erro `'Motivo da rejeição é obrigatório'`.
20. **C3 — Não-admin**: erro de acesso negado.
21. **C4 — Status inválido**: tenta rejeitar uma `entregue` → erro.

### Bloco D — Atomicidade global
22. **D1**: força um erro no meio de `aprovar_solicitacao` (ex.: aprovação que excede limite sem justificativa **depois** de já ter passado pela leitura do fundo) e confirma que **nem o status, nem o saldo, nem historico/notificações** foram alterados — comprova rollback transacional.

## Como vou medir resultados

Para cada teste:
- Snapshot de `solicitacoes`, `fundos.saldo_atual`, `historico_fundos` (count), `notificacoes` (count) **antes**
- Executa o RPC
- Captura: retorno, exceção (se houver), e snapshot **depois**
- Compara delta esperado vs observado e marca PASS/FAIL
- Resultado consolidado em uma tabela final no chat

## Estrutura técnica da execução

1. **Migration `teste_rpcs_financeiras_setup`** — cria função helper `public._run_rpc_test(...)` que aceita um bloco SQL, captura saldo/contagens antes/depois, intercepta exceptions e grava em uma tabela temporária `_test_results`. Cria também as solicitações-fixture necessárias.
2. **`supabase--read_query`** repetidos para inspecionar `_test_results` e os deltas após cada caso.
3. **Migration `teste_rpcs_financeiras_cleanup`** — DROP da função helper, DELETE de todas as solicitações de teste (filtradas por uma justificativa marcadora `'[E2E-TEST-RPCS]'`), DELETE das linhas correlatas em `historico_fundos`/`notificacoes`, e **restaura `fundos.saldo_atual` para R$ 1.668,92** da empresa OXYGENI HUB. Validação final: `SELECT saldo_atual` deve voltar exatamente ao valor inicial.

## Critério de aceitação

- 22/22 testes com resultado esperado (PASS)
- `fundos.saldo_atual` da OXYGENI HUB == **1668.92** após o cleanup
- Nenhuma linha de teste remanescente em `solicitacoes`, `historico_fundos`, `notificacoes`
- Nenhum arquivo em `src/` modificado
- Nenhuma policy/função de produção alterada

## Fora de escopo

- Testes via UI/browser (validação é puramente no banco — fonte da verdade das regras)
- Testes da pipeline de IA (`leitor-notas`) — já validados em outra etapa
- `importar_notas_lote` (não existe ainda)
- Qualquer alteração nas RPCs (esta etapa só **valida** o que foi entregue na Etapa 4)

Posso aprovar para executar?
