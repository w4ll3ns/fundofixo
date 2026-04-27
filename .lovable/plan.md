## Diagnóstico

Você executou um **"Desfazer baixa"** (não uma "Excluir baixa"). O fluxo atual de "Desfazer baixa" em `src/pages/admin/Solicitacoes.tsx` tem um modelo conceitual frágil: ele lê apenas `solicitacao.troco_real` e estorna isso do fundo, assumindo que esse valor já tinha voltado. Isso ignora:

- Devoluções/reversões de troco já lançadas manualmente antes (no seu caso, +R$ 89,40 em 20:17 e -R$ 89,40 em 20:27).
- Que ao voltar a baixa para `entregue`, o `valor_entregue` continua "fora do fundo" (correto), mas se houve devolução de troco anterior, o valor já parcialmente devolvido não é considerado.

Resultado no histórico do fundo OXYGENI HUB (saldo R$ 1.479,52):
- 20:51 — Lançamento `ajuste -189,40` ("Desfazimento de baixa (estorno do troco)") sem `solicitacao_id` e sem qualquer relação contábil válida com as movimentações anteriores. Esse é o lançamento que "comeu" R$ 189,40 do saldo indevidamente.

Saldo correto após essa exclusão deveria ter sido **R$ 1.668,92** (ou seja, o ajuste de -189,40 não deveria ter ocorrido — a baixa que você desfez não tinha troco pendente, pois ele já havia sido processado em 20:17/20:27).

## Plano de correção

### 1. Corrigir o saldo agora (operacional)

Inserir dois lançamentos no `historico_fundos` da OXYGENI HUB e atualizar `fundos.saldo_atual`:

- Lançar `ajuste +189,40` com descrição: "Estorno de lançamento incorreto em 27/04/2026 20:51 (Desfazimento de baixa) — saldo restaurado para R$ 1.668,92".
- `saldo_atual` do fundo passa de 1.479,52 → **1.668,92**.

Mantenho o lançamento errado original visível para auditoria (não removo do histórico).

### 2. Refatorar "Desfazer baixa" (`handleDesfazerBaixa` em `src/pages/admin/Solicitacoes.tsx`)

Trocar a lógica atual (que só estorna `troco_real`) por uma reversão **completa** dos lançamentos da solicitação no fundo:

1. Buscar todos os lançamentos de `historico_fundos` onde `solicitacao_id = selectedSolicitacao.id`.
2. Calcular o **impacto líquido** desses lançamentos no saldo:  
   `impacto = soma(valores)` (saídas são negativas, devoluções/estornos positivos).
3. Aplicar um único `ajuste` compensatório com `valor = -impacto`, descrição clara (ex.: "Desfazimento de baixa — reversão líquida de lançamentos vinculados. Motivo: …"), com `solicitacao_id` preenchido.
4. Atualizar `fundos.saldo_atual = saldo_atual - impacto`.
5. Reverter status para `entregue` e zerar `valor_gasto_real`, `troco_real`, `data_baixa` (como já faz hoje).
6. Notificar o usuário.

**Observação importante**: como ao "desfazer" a baixa o `valor_entregue` continua fora do fundo (a solicitação volta para `entregue`), o lançamento original de `saida` deve ser **mantido no fundo** (não revertido). Para isso, vamos filtrar: revertemos apenas lançamentos cujo `tipo` seja `devolucao_troco` ou `ajuste` ligado ao troco/baixa, **não** o `saida`/`solicitacao_retroativa` original. Lógica final:

- Reverter apenas lançamentos de tipos: `devolucao_troco`, `ajuste` cuja `descricao` contenha indicação de troco/baixa para essa solicitação.
- Não reverter `saida`/`solicitacao_retroativa` (esses representam o valor ainda em poder do solicitante).

### 3. Tornar o estorno idempotente

Antes de fazer o estorno, verificar se já existe um lançamento com descrição `"Desfazimento de baixa"` para a mesma `solicitacao_id` — se sim, abortar com mensagem de erro ("Esta baixa já foi desfeita anteriormente").

### 4. Melhorias de UX no modal "Desfazer baixa" (opcional, recomendado)

- Mostrar antes da confirmação:
  - Lançamentos que serão revertidos (lista resumida).
  - Saldo antes / saldo depois projetado.
- Bloquear botão se a operação for não-econômica (impacto = 0) e exibir aviso.

## Arquivos afetados

- `src/pages/admin/Solicitacoes.tsx` — refatorar `handleDesfazerBaixa` e melhorar UI do `desfazerDialog`.
- Operação de dados (não migração): inserir um lançamento de ajuste em `historico_fundos` e atualizar `fundos.saldo_atual` da OXYGENI HUB.

## Riscos / pontos de atenção

- A regra de quais lançamentos reverter precisa ser conservadora. Vou usar marcadores de descrição já estabelecidos no código atual ("Troco devolvido", "Reversão de baixa", "Desfazimento de baixa") + tipos `devolucao_troco`/`ajuste`. Se houver dúvida, o operador será avisado e o sistema pedirá confirmação extra.
- O lançamento errado de R$ 189,40 (sem `solicitacao_id`) não será removido — apenas compensado, preservando trilha de auditoria.

Após aprovar, aplico a correção do saldo e a refatoração no mesmo passo.