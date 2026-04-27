# Correção da baixa de COMPRA_AVULSA — saldo do fundo

## Diagnóstico

Analisando a última baixa de hoje (id `e7107bef-...`, "TESTE DO VALOR", COMPRA_AVULSA):

| Campo | Valor |
|---|---|
| valor_solicitado / valor_entregue | R$ 300,00 |
| **valor_gasto_real (digitado na baixa)** | **R$ 110,60** |
| troco_real | R$ 189,40 |
| status | baixada |

Os dados foram gravados corretamente em `solicitacoes`. **O problema não está na gravação** — está no **impacto sobre o saldo do fundo**.

### Causa raiz

Hoje a regra é:
- **FUNDO_FIXO**: debita `valor_entregue` na aprovação. Ao baixar, devolve `troco_real` se positivo. Resultado líquido = `valor_gasto_real`. ✅
- **COMPRA_AVULSA**: **não impacta o saldo do fundo** em nenhum momento (nem na aprovação, nem na baixa). ❌

Mas no fluxo real desta baixa, a Stefhane recebeu R$ 300 do caixa físico para uma compra avulsa, gastou R$ 110,60 e deveria devolver R$ 189,40 ao caixa — porém o sistema **não registrou nada disso no fundo**. Daí a percepção de que "baixou pelo valor solicitado": o saldo continua como se nada tivesse saído nem voltado, mas no caixa físico saíram R$ 110,60.

Adicionalmente, a regra atual de devolução de troco (`Baixa.tsx` linha 189 e `ModalBaixaAdmin.tsx` linha 189) roda mesmo para COMPRA_AVULSA, **creditando** troco num saldo que nunca foi debitado — o que inflaria o fundo se o usuário tivesse usado dinheiro do fundo. Felizmente, neste caso não disparou porque a COMPRA_AVULSA foi tratada à parte do fundo, mas o código está logicamente inconsistente.

## Decisão de regra (a confirmar pelo usuário no plano)

Tratar COMPRA_AVULSA com a **mesma mecânica do FUNDO_FIXO** quando o dinheiro sai do caixa físico:
1. Na **aprovação** (`ModalAprovacao` / endpoint de aprovação): debitar `valor_entregue` do `fundos.saldo_atual` e registrar `historico_fundos` com `tipo='saida'`, `descricao='Adiantamento compra avulsa - <solicitante>'`.
2. Na **baixa** com `troco_real > 0`: creditar o troco e registrar `tipo='devolucao_troco'` (já existe).
3. Na **baixa** com `valor_gasto_real > valor_entregue` (`pendente_ajuste`): nenhum efeito até o admin resolver o ajuste (igual ao FUNDO_FIXO).

Resultado para a baixa de hoje, retroativamente: deveria existir `-R$ 300` (saída) e `+R$ 189,40` (troco) no histórico → impacto líquido `-R$ 110,60`.

## Mudanças propostas

### 1. Aprovação (debitar fundo também para COMPRA_AVULSA)

Localizar onde a aprovação atualiza `solicitacoes.status = 'entregue'` (a request PATCH do log) e replicar para COMPRA_AVULSA o mesmo bloco de débito do fundo já usado em FUNDO_FIXO. Buscar com `rg "tipo_solicitacao.*FUNDO_FIXO" src` para identificar o ponto exato (provavelmente `src/pages/admin/Solicitacoes.tsx` ou um modal de aprovação).

### 2. Baixa (`src/pages/user/Baixa.tsx` e `src/components/admin/ModalBaixaAdmin.tsx`)

A devolução de troco (linhas 188-216 em ambos) já é genérica — passa a ser correta para os dois tipos uma vez que a aprovação debite o fundo.

### 3. Migração de correção (data fix)

Para a solicitação `e7107bef-584f-4e7e-baa6-dada40128d21` (já baixada e que afetou caixa físico):
- Inserir em `historico_fundos`:
  - `tipo='saida'`, `valor=-300`, `saldo_anterior=2431.49`, `saldo_posterior=2131.49`, `descricao='Ajuste retroativo: adiantamento compra avulsa TESTE DO VALOR'`
  - `tipo='devolucao_troco'`, `valor=189.40`, `saldo_anterior=2131.49`, `saldo_posterior=2320.89`, `descricao='Ajuste retroativo: troco compra avulsa TESTE DO VALOR'`
- Atualizar `fundos.saldo_atual` para **R$ 2.320,89**.

> **Atenção**: isto contradiz a memória `request-types-and-balance-impact` que diz "COMPRA_AVULSA does not reduce balance". Essa memória será atualizada caso você confirme a nova regra.

## Pergunta antes de executar

A COMPRA_AVULSA, na prática operacional de vocês, **sai do mesmo caixa físico do fundo fixo** (precisa debitar e devolver troco) ou é um pagamento por outro meio (cartão corporativo / reembolso) que **não toca o caixa**?

- **Opção A (recomendada se sai do caixa)**: aplicar plano completo acima — debita na aprovação, devolve troco na baixa, e ajusta retroativamente o saldo para R$ 2.320,89.
- **Opção B (se não toca o caixa)**: nenhuma alteração de regra — apenas ajustar a UI da baixa para não confundir (ex: ocultar bloco de troco quando COMPRA_AVULSA, ou explicitar "não impacta fundo"). Saldo permanece R$ 2.431,49.
