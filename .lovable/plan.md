# Fix: erro 400 ao excluir baixa pendente

## Causa raiz

A tabela `historico_fundos` tem um CHECK constraint que limita os valores válidos da coluna `tipo` a:
`'entrada' | 'saida' | 'solicitacao_retroativa' | 'baixa' | 'ajuste'`.

O `ModalExcluirBaixa` tenta inserir `tipo: 'estorno'`, o que viola o constraint e devolve **400 Bad Request**.

## Correção

Trocar o `tipo` enviado pelo frontend de `'estorno'` para `'ajuste'` (já permitido), preservando a descrição completa para auditoria. Não há necessidade de migração de banco.

**Arquivo**: `src/components/admin/ModalExcluirBaixa.tsx` (linha 87)

```diff
-  tipo: 'estorno',
+  tipo: 'ajuste',
   valor: valorEntregue,
   saldo_anterior: saldoAnterior,
   saldo_posterior: novoSaldo,
   descricao: `Estorno por exclusão de baixa pendente (${nome}). Motivo: ${motivo}`,
```

A descrição (`"Estorno por exclusão de baixa pendente..."`) continua deixando claro o tipo real da operação no histórico, e a coluna `solicitacao_id` da `historico_fundos` está com `ON DELETE SET NULL`, então o registro de auditoria sobrevive à exclusão da solicitação.

## Atualização da memória

Reverter `mem://data-model/historico-fundos-transaction-types` para a lista original (sem `'estorno'`), já que continuaremos usando `'ajuste'` para esse caso, com descrição diferenciada.

## Fora de escopo

- O warning do React (`Function components cannot be given refs` em `DialogFooter`) continua aparecendo, mas é benigno e não bloqueia a funcionalidade. Pode ser tratado em outra iteração se incomodar.
