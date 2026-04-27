# Adicionar coluna Razão Social na listagem de Solicitações

## Contexto

A página `/admin/solicitacoes` exibe a tabela de solicitações sem mostrar a razão social do emitente da nota fiscal. O campo `nome_emitente` já existe na tabela `solicitacoes` e já é carregado na query (`fetchData`), então é apenas uma alteração de UI — sem mudanças de banco.

## Alterações

**Arquivo:** `src/pages/admin/Solicitacoes.tsx`

### 1. Tabela desktop
Adicionar uma nova coluna "Razão Social" entre "Empresa" e "Solicitado":
- Novo `<th>` no cabeçalho
- Novo `<td>` na linha exibindo `sol.nome_emitente || '-'` (com `truncate` e `max-w` para não quebrar layout em nomes longos, e `title` para tooltip completo)

### 2. Card mobile
Adicionar uma linha mostrando "Emitente: {nome_emitente}" abaixo do nome da empresa, somente quando o campo existir, com truncamento.

### 3. Busca
Incluir `nome_emitente` no filtro `search` para permitir buscar solicitações pelo nome do fornecedor da nota.

## Itens fora do escopo
- Sem mudanças no schema ou RLS (campo já existe e é lido).
- Sem alteração nas demais páginas (BaixasPendentes, RelatoriosConsultivo, etc.). Posso replicar depois se quiser.
