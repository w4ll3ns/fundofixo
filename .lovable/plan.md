## Contexto

Quando o usuário faz a baixa e o valor gasto na nota é **maior** que o valor entregue, a solicitação fica com status `pendente_ajuste` e `troco_real` negativo (no caso atual: gastou R$ 212,88, recebeu R$ 150,00 → diferença de R$ 62,88).

Hoje **não existe** tela para o admin resolver essa pendência. A regra de negócio que precisamos implementar reconhece **duas origens possíveis** para esse excedente:

1. **Complemento retirado do fundo fixo depois** — o usuário pegou os R$ 62,88 a mais diretamente do fundo (em dinheiro/cartão da empresa) após a entrega original. Nesse caso o fundo já foi de fato debitado fisicamente, então o sistema precisa **registrar a saída adicional** para refletir a realidade.
2. **Adiantamento do usuário (reembolso)** — o usuário cobriu a diferença com dinheiro próprio e a empresa precisa **reembolsá-lo**. Nesse caso o fundo não muda, mas fica registrado que existe um valor a pagar / pago ao colaborador.

## O que vai ser construído

### 1. Schema (migration)

Adicionar em `solicitacoes`:
- `tipo_ajuste` (text, nullable) — `'complemento_fundo'` | `'reembolso_usuario'`
- `valor_ajuste` (numeric, nullable) — valor absoluto da diferença resolvida
- `data_ajuste` (timestamptz, nullable)
- `admin_ajuste_id` (uuid, nullable)
- `observacao_ajuste` (text, nullable)

Não criamos CHECK constraint (regra: usar trigger se necessário). Validação fica no front + edge.

### 2. Componente novo: `ModalResolverAjuste.tsx`

Modal acionado a partir da lista admin de solicitações (e da tela de detalhes) quando `status = 'pendente_ajuste'`.

Conteúdo:
- Resumo: valor entregue, valor gasto real, diferença (R$ 62,88)
- Visualização da nota fiscal
- Radio com **2 opções**:
  - **Complemento do fundo fixo** — "O usuário retirou esse valor adicional do fundo após a entrega"
  - **Reembolso ao usuário** — "O usuário pagou com dinheiro próprio e será reembolsado"
- Campo opcional de observação
- Botão "Confirmar resolução"

Ao confirmar:
- Atualiza `solicitacoes`: `status = 'baixada'`, `tipo_ajuste`, `valor_ajuste`, `data_ajuste`, `admin_ajuste_id`, `observacao_ajuste`
- Se **complemento_fundo**: debita o fundo da empresa pelo valor da diferença, insere `historico_fundos` com `tipo = 'ajuste'`, `valor` negativo, descrição "Complemento retirado do fundo - excedente da solicitação X"
- Se **reembolso_usuario**: **não** mexe no saldo do fundo. Insere `historico_fundos` com `tipo = 'ajuste'`, `valor = 0` apenas para auditoria, descrição "Reembolso ao usuário Y - excedente da solicitação X" (ou pulamos o histórico de fundos e gravamos só o registro na solicitação)
- Cria `notificacao` para o solicitante avisando que a pendência foi resolvida

### 3. Pontos de entrada na UI

- **`src/pages/admin/Solicitacoes.tsx`**: na linha de cada solicitação com status `pendente_ajuste`, botão "Resolver Ajuste" abrindo o novo modal
- **`src/pages/admin/BaixasPendentes.tsx`**: passar a listar também as `pendente_ajuste` (ou criar aba separada "Pendentes de Ajuste") para que o admin não precise filtrar manualmente
- **`src/pages/admin/Dashboard.tsx`**: card/contador "Ajustes pendentes" com link para a lista filtrada

### 4. Visualização do ajuste resolvido

- **`src/pages/user/DetalhesSolicitacao.tsx`**: quando `tipo_ajuste` estiver preenchido, exibir bloco "Ajuste realizado" mostrando o tipo (Complemento do Fundo / Reembolso ao Usuário), valor, data, admin e observação. Esconder o botão "Refazer baixa" quando já foi resolvido.

### 5. Resolução da solicitação atual

A solicitação `a3178c50-...` (R$ 62,88 de diferença) ficará disponível na nova tela para o admin classificar e fechar.

## Fluxo visual

```text
Status pendente_ajuste
        │
        ▼
[Admin abre Modal Resolver Ajuste]
        │
   ┌────┴────┐
   ▼         ▼
Complemento  Reembolso
do Fundo     ao Usuário
   │            │
Debita fundo   Não mexe no fundo
+ histórico    + registro auditoria
   │            │
   └────┬───────┘
        ▼
  status = baixada
  notifica solicitante
```

## Arquivos afetados

| Arquivo | Ação |
|---|---|
| `supabase/migrations/...` | **criar** colunas `tipo_ajuste`, `valor_ajuste`, `data_ajuste`, `admin_ajuste_id`, `observacao_ajuste` em `solicitacoes` |
| `src/components/admin/ModalResolverAjuste.tsx` | **criar** |
| `src/pages/admin/Solicitacoes.tsx` | botão "Resolver Ajuste" para status pendente_ajuste |
| `src/pages/admin/BaixasPendentes.tsx` | incluir/destacar pendentes de ajuste |
| `src/pages/admin/Dashboard.tsx` | contador de ajustes pendentes |
| `src/pages/user/DetalhesSolicitacao.tsx` | exibir bloco "Ajuste realizado" + esconder refazer baixa quando resolvido |

Pronto para implementar quando você aprovar.
