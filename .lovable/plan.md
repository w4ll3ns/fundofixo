# Reconciliação do Fundo Fixo + Correção da Tela de Detalhes

## Contexto

Auditoria completa identificou divergência de **R$ 447,48** entre o saldo real do banco (R$ 2.510,29) e o saldo correto pelas regras de negócio (R$ 2.062,81) no fundo "OXYGENI HUB - RENASCENCA".

Causas:
- 7 solicitações de Dez/2025 entregues mas sem débito (`saida`) registrado no histórico — total **R$ 581,88**
- 3 solicitações com troco positivo nunca creditadas de volta (`devolucao_troco` estava bloqueado pelo CHECK constraint antigo) — total **R$ 157,02**
- Tela de detalhes não exibe `valor_gasto_real` nem o troco/diferença, gerando confusão (ex.: usuário vê R$ 300 entregue mas não vê que foram gastos R$ 292,98 com R$ 7,02 de troco devolvido).

---

## Parte A — Migração de Reconciliação

Migração SQL única que:

1. **Insere 7 lançamentos `saida`** no `historico_fundos` para as solicitações entregues sem débito (Dez/2025), referenciando `solicitacao_id` e com descrição "Reconciliação retroativa — entrega não registrada".
2. **Insere 3 lançamentos `devolucao_troco`** para os trocos não creditados, referenciando `solicitacao_id` e com descrição "Reconciliação retroativa — troco não devolvido".
3. **Recalcula `saldo_anterior`/`saldo_posterior`** dos lançamentos inseridos respeitando a ordem cronológica.
4. **Atualiza `fundos.saldo_atual`** do OXYGENI HUB - RENASCENCA para **R$ 2.062,81**.
5. **Lança um registro `ajuste`** final de auditoria explicando a reconciliação (admin_id = admin atual, descrição "Ajuste de reconciliação geral — auditoria 27/04/2026").

Antes de executar, confirmo via SELECT a lista exata das 10 solicitações afetadas e o delta resultante (deve fechar em -R$ 447,48).

## Parte B — Correção da Tela de Detalhes

Atualizar o componente de detalhes da solicitação (admin e usuário) para exibir:

- **Valor solicitado** (já existe)
- **Valor entregue** (já existe)
- **Valor gasto real** (`valor_gasto_real`) — NOVO
- **Troco devolvido** (`troco_real`) quando > 0 — NOVO
- **Diferença** quando `valor_gasto_real > valor_entregue` (excesso) — NOVO, em destaque vermelho
- Badge visual "Troco devolvido ao fundo" quando aplicável

Arquivos a editar (a confirmar na implementação):
- `src/pages/admin/Solicitacoes.tsx` (modal/drawer de detalhes)
- `src/components/SolicitacaoDetails.tsx` ou equivalente do lado do usuário

---

## Detalhes Técnicos

- Migração via ferramenta de migração (schema já permite `devolucao_troco` após correção anterior).
- Os 10 inserts em `historico_fundos` serão feitos numa transação única.
- O ajuste final em `fundos.saldo_atual` e o lançamento `ajuste` garantem rastreabilidade total.
- A tela usará os campos já existentes na tabela `solicitacoes` — sem mudança de schema.
- Após aplicar, validarei: saldo do fundo = R$ 2.062,81 e soma de `historico_fundos` bate com saldo.

## Resultado Esperado

- Saldo do fundo OXYGENI HUB - RENASCENCA: **R$ 2.062,81** (consistente com regras)
- Histórico completo e auditável (toda saída/troco refletido)
- Tela de detalhes mostra valor real gasto e troco, eliminando dúvidas como a do "TESTE DO VALOR" (R$ 292,98 em vez de R$ 300).
