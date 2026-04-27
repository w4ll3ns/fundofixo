# Correção de saldo + idempotência da exclusão de baixa pendente

## Diagnóstico

Saldo da **OXYGENI HUB** está em **R$ 2.581,49**, mas deveria ser **R$ 2.281,49**.

A baixa pendente da solicitação `360583a6-...` (Stefhane, R$ 50) foi tentada **4 vezes** porque o trigger `update_historico_fundos_updated_at` (já corrigido) interrompia o fluxo **depois** que o saldo já tinha sido creditado e o histórico inserido. A solicitação não chegou a ser apagada (status ainda `entregue`) e o usuário clicava de novo, gerando 4 créditos de R$ 50 em vez de 1.

Histórico mostra 4 entradas idênticas de "Estorno por exclusão de baixa pendente" para a mesma `solicitacao_id`. Excesso = 3 × R$ 50 = **R$ 150**.

Já foi inserido um registro no `historico_fundos` documentando a correção (`valor = -150`, descrição "Correção: estorno duplicado..."). Falta apenas atualizar o saldo do fundo.

## Ações

### 1. Corrigir o saldo (migration)

```sql
UPDATE public.fundos
SET saldo_atual = 2431.49
WHERE id = 'ad43cc52-2853-40d8-bfef-b409b7900b6f';
```

Resultado: saldo passa de R$ 2.581,49 → R$ 2.431,49.

> Observação: o saldo "verdadeiro" considerando o estorno legítimo de R$ 50 da baixa cancelada é R$ 2.281,49. Mas como a solicitação `360583a6-...` ainda existe com status `entregue`, ela **continua descontada** do saldo. Ao excluí-la corretamente (próxima ação), o saldo será creditado de R$ 50, fechando em R$ 2.281,49. Por isso o ajuste é R$ -150 (não R$ -200).

### 2. Tornar `ModalExcluirBaixa` idempotente

Antes de creditar e inserir histórico, verificar se já existe um registro de estorno para a mesma `solicitacao_id` com `descricao` contendo "Estorno por exclusão de baixa pendente". Se existir, pular o passo 1 (apenas seguir para apagar arquivo + notificações + solicitação).

```ts
// Antes do crédito:
const { data: jaEstornado } = await supabase
  .from('historico_fundos')
  .select('id')
  .eq('solicitacao_id', solicitacao.id)
  .ilike('descricao', 'Estorno por exclusão de baixa pendente%')
  .limit(1)
  .maybeSingle();

if (jaEstornado) {
  // pula crédito e histórico — já foi feito numa tentativa anterior
} else {
  // ... fluxo atual de crédito + insert no histórico
}
```

Isso garante que retentar a exclusão (após erro de rede, trigger, RLS etc.) não duplique créditos.

### 3. (Opcional) Excluir a solicitação `360583a6-...` agora que o fluxo está correto

Após o fix do saldo + idempotência, basta clicar em "Excluir baixa" novamente na UI — o passo 1 será pulado (já há estorno), o passo 4 vai apagar a solicitação e o saldo cairá de R$ 2.431,49 para R$ 2.281,49 automaticamente via novo crédito? Não — exatamente o oposto: como pulamos o crédito, o saldo permanece R$ 2.431,49, mas a solicitação some. O valor de R$ 50 que ela "ainda descontava" precisa ser creditado.

**Refinamento**: a checagem de idempotência deve ser por **soma**: se já há estorno cobrindo o `valor_entregue`, pula. Caso contrário, credita o que faltar. Implementação simples para este caso: somar `valor` dos históricos de "Estorno por exclusão de baixa pendente" para essa solicitação. Se já ≥ `valor_entregue`, pula.

### Resumo do código a alterar

`src/components/admin/ModalExcluirBaixa.tsx`: adicionar checagem antes do bloco de crédito (linhas 66–96).

## Fora de escopo

- Auditar outros lugares que possam sofrer do mesmo problema (criação manual de fundo, baixa normal). O risco era específico do trigger removido e já foi mitigado.
