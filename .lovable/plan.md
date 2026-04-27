## Adicionar botão "Desfazer baixa" diretamente na tabela de solicitações

### Mudança única
**`src/pages/admin/Solicitacoes.tsx`** — adicionar botão `Undo2` na coluna de ações em ambas as visualizações:

1. **Helper** `openDesfazer(sol)` — define a solicitação selecionada, limpa o motivo e abre o `desfazerDialogOpen` já existente.
2. **Desktop (tabela, ~linha 577)** — botão ghost com ícone `Undo2` em vermelho (`text-destructive`), tooltip "Desfazer baixa", visível quando `status ∈ {baixada, pendente_ajuste}`.
3. **Mobile (cards, ~linha 491)** — botão `outline` destrutivo com ícone `Undo2` + texto "Desfazer", mesma condição de visibilidade.

### Comportamento
- Clicar abre o dialog de confirmação já implementado (com aviso sobre estorno do troco e campo obrigatório de motivo).
- Reaproveita 100% do handler `handleDesfazerBaixa` existente.
- O botão dentro do modal de detalhes permanece como caminho alternativo.

Sem mudanças de schema, RLS ou novos componentes.