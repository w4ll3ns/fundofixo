## Objetivo

1. Reverter manualmente a baixa da solicitação de R$ 200 da Stefhane para que ela possa concluir a baixa corretamente.
2. Criar uma ação reutilizável de **"Desfazer baixa"** disponível no painel admin para correções futuras em qualquer solicitação já baixada.

---

## Parte 1 — Reversão pontual (Stefhane, R$ 200)

Solicitação `a53bf676-...` está com:
- `status = baixada`, `valor_gasto_real = 110,60`, `troco_real = 89,40`, `data_baixa = 27/04`
- Histórico do fundo: saída de R$ 200 (entrega) + devolução de troco R$ 89,40

Migration única que executa de forma transacional:
1. Estorna o troco no fundo: subtrai R$ 89,40 do `fundos.saldo_atual` da empresa correspondente.
2. Insere registro em `historico_fundos` do tipo `ajuste` com descrição "Reversão de baixa para correção — solicitação Stefhane R$ 200" (saldo_anterior/posterior corretos).
3. Atualiza a solicitação:
   - `status` volta para `entregue`
   - Limpa `data_baixa`, `valor_gasto_real`, `troco_real`
   - Mantém intactos os registros já existentes em `solicitacao_notas` (viram rascunho automaticamente, conforme regra atual).

Resultado: a Stefhane volta a ver a solicitação na aba "Baixa pendente" com badge "Baixa parcial · N" e botão "Continuar Baixa", já com as notas que ela havia anexado.

---

## Parte 2 — Ação "Desfazer baixa" no painel admin

### UX
- Em **`/admin/solicitacoes`**, no modal de detalhes (`Solicitacoes.tsx`), quando `status = baixada` ou `pendente_ajuste`, exibir um botão secundário destrutivo **"Desfazer baixa"** (ícone Undo2), visível apenas para admin.
- Ao clicar, abre `AlertDialog` de confirmação explicando:
  - A solicitação volta para o status **"entregue"** (baixa pendente).
  - O troco devolvido (se houver) será **estornado do fundo fixo**.
  - As notas fiscais já anexadas **permanecem** (como rascunho) para o usuário corrigir.
  - Campo obrigatório: **motivo do desfazimento**.
- Após confirmar, mostra toast de sucesso e atualiza a lista.

### Lógica (client-side, dentro de `Solicitacoes.tsx`)
Função `handleDesfazerBaixa(solicitacao, motivo)`:
1. Busca `fundo` da `empresa_id` da solicitação.
2. Se `troco_real > 0`:
   - Atualiza `fundos.saldo_atual = saldo_atual - troco_real`.
   - Insere `historico_fundos` (`tipo = 'ajuste'`, valor negativo, descrição "Desfazimento de baixa: {motivo} — admin {nome}", `saldo_anterior`/`saldo_posterior`, `solicitacao_id`, `admin_id`).
3. Atualiza `solicitacoes`:
   - `status = 'entregue'`
   - `data_baixa = null`, `valor_gasto_real = null`, `troco_real = null`
   - `observacoes_admin` recebe append: "[Baixa desfeita em {data} por {admin}: {motivo}]"
4. Cria `notificacao` para `solicitante_user_id` com título "Baixa desfeita para correção" e link para `/baixa/{id}`.

### Onde mais expor
- **`/admin/baixas-pendentes`** (`BaixasPendentes.tsx`): também listar opcionalmente solicitações já `baixada` com filtro/aba "Recentemente baixadas" — fora do escopo desta entrega; manter botão apenas no modal de detalhes em Solicitações.

---

## Detalhes técnicos

- **Arquivos editados**: `src/pages/admin/Solicitacoes.tsx` (botão + handler + AlertDialog com Textarea para motivo).
- **Migration**: única, idempotente para a reversão pontual da Stefhane (com `WHERE id = ...` e `WHERE status = 'baixada'` para segurança).
- **Sem alterações de schema**: a operação usa apenas as colunas/tipos já existentes; `tipo = 'ajuste'` já é valor válido em `historico_fundos`.
- **RLS**: admin já tem `UPDATE` em `solicitacoes` e `ALL` em `fundos`/`historico_fundos`, então não precisa novas policies.
- **Notas fiscais**: registros em `solicitacao_notas` permanecem; como o status volta a `entregue`, as RLS permitem ao usuário continuar editando.

---

## Resumo do que o usuário verá

- A solicitação de R$ 200 da Stefhane reaparece para ela como "baixa pendente" com as notas já anexadas preservadas.
- No admin, qualquer baixa concluída poderá ser desfeita com um clique + motivo, estornando troco automaticamente e notificando o solicitante.