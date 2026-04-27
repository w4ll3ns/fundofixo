# Exclusão de Baixas Pendentes (com estorno automático)

Permitir que admins excluam solicitações que estão aguardando prestação de contas (status `entregue` ou `pendente_ajuste`), revertendo o impacto financeiro de forma segura e auditável. A ação ficará disponível tanto na página **Baixas Pendentes** quanto na página de **Detalhes da Solicitação**.

## Caso de teste
- Solicitação: `360583a6-efda-4d5b-9027-9fab3b94c312` (Stefhane Silva / OXYGENI HUB / FUNDO_FIXO R$ 50,00 / status `entregue`).

## Comportamento

1. Admin clica no ícone de lixeira (na linha da tabela / card mobile de Baixas Pendentes, ou no topo da tela de Detalhes).
2. Abre o **ModalExcluirBaixa** com:
   - Resumo da solicitação (empresa, solicitante, tipo, valor entregue, data aprovação).
   - Aviso explícito do que será revertido.
   - Campo obrigatório **"Motivo da exclusão"** (mín. 10 caracteres).
   - Botões: Cancelar / Excluir (destructive).
3. Ao confirmar:
   - Se `tipo_solicitacao = FUNDO_FIXO` e `valor_entregue > 0`: soma `valor_entregue` de volta em `fundos.saldo_atual` da empresa.
   - Insere registro em `historico_fundos` com `tipo = 'estorno'`, `valor = valor_entregue`, `saldo_anterior`/`saldo_posterior` corretos, `descricao` contendo o motivo informado, `solicitacao_id` da solicitação excluída e `admin_id`.
   - Remove o arquivo de nota fiscal do bucket `notas-fiscais` (se houver `upload_nota_fiscal_url`).
   - Apaga as `notificacoes` cujo `link` aponta para a solicitação (evita links quebrados).
   - Cria notificação `warning` para o solicitante: "Sua baixa pendente de R$ X foi cancelada pelo administrador. Motivo: ...".
   - Apaga a linha em `solicitacoes`.
4. Toast de sucesso e refresh da lista.

## Impacto financeiro (resumo)

| Tipo | valor_entregue | Ação no saldo |
|---|---|---|
| FUNDO_FIXO | > 0 | Soma de volta ao `fundos.saldo_atual` |
| COMPRA_AVULSA | qualquer | Não altera saldo (não debitou) |

O registro `historico_fundos` com `tipo = 'estorno'` preserva trilha de auditoria mesmo após a exclusão da solicitação.

## Detalhes técnicos

**Migração SQL** (`supabase/migrations/...`):
- `CREATE POLICY "Admins can delete solicitacoes" ON public.solicitacoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));`
- `CREATE POLICY "Admins can delete notificacoes" ON public.notificacoes FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'));`
- `historico_fundos` já tem policy `ALL` para admin (não precisa nova).
- Atualizar memory `mem://data-model/historico-fundos-transaction-types` para incluir `'estorno'`.

**Novo componente** `src/components/admin/ModalExcluirBaixa.tsx`:
- Props: `open`, `onOpenChange`, `solicitacao`, `onSuccess`.
- Lógica em sequência (sem RPC, transação client-side cuidadosa, abortando em erro):
  1. Refetch do `fundos.saldo_atual` da empresa.
  2. Upsert do `fundos` com novo saldo (se FUNDO_FIXO).
  3. Insert em `historico_fundos` (estorno).
  4. `supabase.storage.from('notas-fiscais').remove([path])` extraído da URL.
  5. `delete from notificacoes where link ilike '%/solicitacao/<id>%'`.
  6. `delete from solicitacoes where id = ...`.
  7. Insert nova notificação para o solicitante.

**`src/pages/admin/BaixasPendentes.tsx`**:
- Importar `Trash2` e o novo modal.
- Adicionar estado `deleteModalOpen` + `selectedToDelete`.
- Tabela desktop: novo botão `ghost` com `Trash2` (text-destructive) ao lado de Ver/Baixa.
- Cards mobile: terceiro botão "Excluir" (variant `outline`, ícone Trash2) na linha de ações.
- `onSuccess` → `fetchData()`.

**`src/pages/user/DetalhesSolicitacao.tsx`**:
- Quando `isAdmin` e `status ∈ {entregue, pendente_ajuste}`: mostrar botão "Excluir baixa" no header de ações.
- Após sucesso: `navigate('/admin/baixas-pendentes')`.

## Arquivos

- **Novo**: `supabase/migrations/<timestamp>_admin_delete_baixas.sql`
- **Novo**: `src/components/admin/ModalExcluirBaixa.tsx`
- **Editar**: `src/pages/admin/BaixasPendentes.tsx`
- **Editar**: `src/pages/user/DetalhesSolicitacao.tsx`
- **Memory**: atualizar `mem://data-model/historico-fundos-transaction-types`

## Fora de escopo

- Exclusão de solicitações já com baixa concluída (`status = 'concluida'` / `quitada`) — exigiria reverter também o gasto e a nota fiscal contábil; pode ser feito em iteração posterior.
- "Soft delete" / lixeira com restauração — usaremos hard delete (histórico fica preservado em `historico_fundos`).
