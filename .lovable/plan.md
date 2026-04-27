## Validação de Consistência de Saldo

Adicionar uma checagem automática que compara `fundos.saldo_atual` com o saldo derivado do `historico_fundos`, alertando o admin quando houver divergência.

### Abordagem de cálculo

Para cada fundo, considerar o **`saldo_posterior` do registro mais recente** em `historico_fundos` como saldo esperado. Essa é a fonte mais confiável porque os valores em `tipo='ajuste'` já vêm com sinal embutido (positivo ou negativo), o que torna inseguro recomputar via `SUM(valor * sinal_do_tipo)`.

- Saldo esperado = `saldo_posterior` da última transação (ORDER BY `created_at` DESC)
- Se não houver histórico, esperado = 0
- Divergência = `|saldo_atual - saldo_esperado| > 0.01`

### Implementação

**1. Hook `useAuditoriaSaldos`** (`src/hooks/useAuditoriaSaldos.ts`)
- Busca todos os fundos + última entrada do histórico de cada um
- Retorna lista de `{ fundo_id, empresa_nome, saldo_atual, saldo_esperado, diferenca, ultima_movimentacao_em }`
- Filtra apenas divergências (>= R$ 0,01)

**2. Componente `AlertaDivergenciaSaldo`** (`src/components/admin/AlertaDivergenciaSaldo.tsx`)
- Card de alerta exibido no topo do `Dashboard` admin e em `GestaoSaldo`
- Mostra apenas quando há divergências
- Lista cada fundo divergente: empresa, saldo atual, esperado, diferença (com cor)
- Botão "Ver histórico" abre o modal de histórico do fundo correspondente
- Botão "Corrigir saldo" (admin) abre dialog para registrar um `ajuste` igual à diferença com descrição obrigatória, alinhando `fundos.saldo_atual` ao esperado

**3. Integração no Dashboard admin** (`src/pages/admin/Dashboard.tsx`)
- Renderizar `<AlertaDivergenciaSaldo />` acima dos KPIs

**4. Integração em GestaoSaldo** (`src/pages/admin/GestaoSaldo.tsx`)
- Renderizar `<AlertaDivergenciaSaldo />` no topo da página
- Adicionar badge "⚠ Divergência" na linha do fundo divergente da tabela

### Comportamento da correção

Ao clicar em "Corrigir saldo":
1. Insere registro em `historico_fundos` com `tipo='ajuste'`, `valor = saldo_esperado - saldo_atual`, `saldo_anterior = saldo_atual`, `saldo_posterior = saldo_esperado`, `descricao` informada pelo admin (obrigatória, sugerido prefixo "Reconciliação automática:")
2. Atualiza `fundos.saldo_atual = saldo_esperado`
3. Recarrega a auditoria

### Fora do escopo
- Recomputar saldo a partir de `solicitacoes` (a fonte de verdade transacional já é o `historico_fundos`)
- Job em background — a checagem roda no carregamento das telas admin acima