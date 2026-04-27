# Adicionar coluna "Gasto Real" na lista de solicitações (admin)

## O que será feito

Na página `/admin/solicitacoes`, adicionar uma nova coluna **"Gasto Real"** na tabela desktop, posicionada entre "Entregue" e "Data Nota". Exibe `valor_gasto_real` formatado em R$, ou "-" quando ainda não houver baixa.

Quando o gasto real exceder o entregue, o valor aparecerá em destaque (`text-destructive`) para sinalizar excesso.

## Detalhes Técnicos

Arquivo: `src/pages/admin/Solicitacoes.tsx`

1. Adicionar `<th>Gasto Real</th>` após a coluna "Entregue" (linha ~432)
2. Adicionar `<td>` correspondente no map de `filtered` (linha ~454) com:
   - `formatCurrency(sol.valor_gasto_real)` quando preenchido
   - `-` quando nulo
   - Cor `text-destructive` quando `valor_gasto_real > valor_entregue`

Os campos `valor_gasto_real` e `troco_real` já são carregados no SELECT e já existem na interface `Solicitacao`, portanto não precisam de mudanças adicionais.

A versão mobile (cards) já mostra os valores no modal de detalhes — não será alterada nesta tarefa.
