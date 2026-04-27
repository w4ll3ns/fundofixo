
# Baixa com múltiplas notas fiscais

Hoje a baixa aceita apenas **uma** nota fiscal por solicitação (campos `upload_nota_fiscal_url`, `numero_nota`, `nome_emitente`, etc. são únicos na tabela `solicitacoes`). Vamos permitir que o usuário anexe **N notas** numa mesma baixa, cada uma com seu valor, e o `valor_gasto_real` final será a **soma** dos valores das notas.

## Modelo de dados

Criar nova tabela `solicitacao_notas` (uma linha por nota fiscal anexada à baixa):

```text
solicitacao_notas
├── id (uuid, PK)
├── solicitacao_id (uuid, FK lógico → solicitacoes.id, ON DELETE CASCADE)
├── valor (numeric, NOT NULL)
├── upload_url (text, NOT NULL)             -- path no bucket notas-fiscais
├── arquivo_hash (text)                     -- SHA-256 p/ deduplicação
├── data_emissao (date)
├── numero_nota (text)
├── nome_emitente (text)
├── cnpj_emitente (text)
├── descricao (text)
├── ai_valor_extraido (numeric)
├── ai_confianca (ai_confianca)
├── ai_evidencia (text)
├── ai_status (ai_status)
├── ai_processed_at (timestamptz)
├── created_at (timestamptz default now())
└── created_by (uuid)
```

RLS:
- SELECT: dono da solicitação OU admin OU consultivo da empresa correspondente
- INSERT/UPDATE/DELETE: dono da solicitação (status `entregue`/`pendente_ajuste`) OU admin

Os campos legados em `solicitacoes` (`upload_nota_fiscal_url`, `numero_nota`, `nome_emitente`, `cnpj_emitente`, `data_emissao_nota`, `ai_*`) ficam preservados para compatibilidade. Na nova baixa eles serão preenchidos com os dados da **primeira** nota anexada (para que telas antigas e a regra de competência mensal — que usa `data_emissao_nota` — continuem funcionando). O `valor_gasto_real` armazena a soma total.

## Fluxo de UI — `src/pages/user/Baixa.tsx`

Substituir o bloco "upload único + form" por uma **lista de notas anexadas** + botão "Adicionar nota":

```text
┌─ Notas Fiscais (R$ 200,00 a justificar) ──────────────┐
│ ✓ Nota #1 — Padaria X ............... R$ 80,00  [✕]   │
│ ✓ Nota #2 — Posto Y ................. R$ 65,00  [✕]   │
│ ✓ Nota #3 — Mercado Z ............... R$ 50,00  [✕]   │
│ [ + Adicionar nota ]                                   │
│ ─────────────────────────────────────────────────────  │
│ Total gasto: R$ 195,00   Troco: R$ 5,00 (a devolver)   │
└────────────────────────────────────────────────────────┘
```

Comportamento:
- "Adicionar nota" abre o mesmo fluxo atual (upload → IA → form com valor / data / número / emitente / CNPJ / descrição) num **dialog/sheet**, com botão "Salvar nota".
- Ao salvar, a nota vai para a lista local (estado em memória) — ainda não persiste no banco.
- Cada nota da lista pode ser editada (reabre o dialog) ou removida.
- Total e troco são recalculados em tempo real: `valor_gasto = Σ notas.valor`, `troco_real = valor_entregue − valor_gasto`.
- Mantém a regra de status: `troco_real < 0` → `pendente_ajuste`, senão `baixada`.
- Botão "Confirmar Baixa" exige **pelo menos 1 nota**.

Ao confirmar:
1. Faz upload dos arquivos pendentes para `notas-fiscais` (já é feito hoje no momento da seleção; manter).
2. `INSERT` em `solicitacao_notas` (uma linha por nota).
3. `UPDATE` em `solicitacoes` setando `valor_gasto_real`, `troco_real`, `data_baixa`, `status`, e copiando os campos da **primeira nota** para os campos legados (`upload_nota_fiscal_url`, `numero_nota`, `nome_emitente`, `cnpj_emitente`, `data_emissao_nota`, `ai_*`).
4. Devolução de troco ao fundo permanece igual quando `troco_real > 0` e `status = baixada`.

Aplicar exatamente o mesmo padrão em `src/components/admin/ModalBaixaAdmin.tsx` (admin fazendo baixa em nome do usuário).

## Telas de visualização

- **`src/pages/user/DetalhesSolicitacao.tsx`** e **`src/pages/admin/Solicitacoes.tsx` (modal de detalhes)**: trocar a seção "Nota Fiscal" por uma **lista** de notas (lê de `solicitacao_notas`). Para cada nota: emitente, número, data, valor, botão "Ver arquivo" usando `NotaFiscalPreview`. Fallback: se não houver registros em `solicitacao_notas` (baixas antigas), usar os campos legados como hoje.
- **`src/components/admin/ModalResolverAjuste.tsx`**: idem — listar todas as notas anexadas.
- Lista de solicitações (admin e usuário): nada muda na coluna "Gasto Real" — continua mostrando `valor_gasto_real` (que agora é a soma).

## Detecção de duplicidade

A checagem por `arquivo_hash` e por (`numero_nota` + `cnpj_emitente`) hoje compara contra `solicitacoes`. Estender para também comparar contra `solicitacao_notas` (pequeno ajuste em `useImportarNota.ts`/lógica de duplicata, se aplicável ao fluxo de baixa). Dentro da mesma baixa também bloquear duas notas com o mesmo hash.

## Migração

- Criar tabela `solicitacao_notas` + índices em `solicitacao_id` e `arquivo_hash`.
- Habilitar RLS e políticas descritas acima.
- **Não** migrar baixas antigas — a UI faz fallback para os campos legados quando `solicitacao_notas` está vazio para aquela solicitação.

## Arquivos a alterar

- novo: migração SQL para `solicitacao_notas`
- `src/pages/user/Baixa.tsx` — refatorar para lista de notas + dialog de adicionar
- `src/components/admin/ModalBaixaAdmin.tsx` — mesmo padrão
- `src/pages/user/DetalhesSolicitacao.tsx` — listar notas
- `src/pages/admin/Solicitacoes.tsx` — listar notas no modal de detalhes
- `src/components/admin/ModalResolverAjuste.tsx` — listar notas
- (opcional) extrair um componente reutilizável `NotasFiscaisManager` para evitar duplicação entre Baixa do usuário e ModalBaixaAdmin
