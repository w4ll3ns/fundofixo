## Problema

A solicitação de R$ 200,00 (id `a53bf676...`) foi finalizada como `baixada` mesmo tendo apenas 1 nota de R$ 110,60 anexada. Hoje a tela "Realizar Baixa" só tem **um botão "Confirmar Baixa"** que finaliza imediatamente — não há como o usuário **salvar o progresso** (anexar 1 nota agora, voltar mais tarde para anexar as demais).

Resultado: o usuário sente-se forçado a finalizar e o sistema marca como `baixada` sem checar se realmente o gasto bate com o entregue.

## Comportamento desejado

Na tela de baixa do usuário (`/baixa/:id`), oferecer **dois caminhos**:

1. **Salvar Rascunho** — anexa as notas adicionadas, mantém a solicitação como **pendente de baixa** (status fica `entregue` com indicação visual de "baixa parcial em andamento"). Usuário pode voltar e adicionar mais notas depois.
2. **Finalizar Baixa** — só fica habilitado quando o total das notas ≥ valor entregue (ou usuário confirma que houve troco real a devolver). Mantém o fluxo atual (`baixada` ou `pendente_ajuste`).

Enquanto não finalizar, o sistema trata a solicitação como **pendente de baixa** com status visual "Baixa parcial" quando já houver notas salvas mas total < valor entregue.

## Plano de implementação

### 1. Tela `src/pages/user/Baixa.tsx`
- Buscar notas já existentes em `solicitacao_notas` ao carregar (para retomar rascunho).
- Calcular `valorJaSalvo` (notas no banco) + `valorGastoNovo` (notas adicionadas na sessão).
- Substituir o botão único por dois:
  - **"Salvar Rascunho"** → insere apenas as notas novas em `solicitacao_notas`, NÃO atualiza `solicitacoes` (mantém status `entregue`), exibe toast "Rascunho salvo. Você pode voltar para finalizar".
  - **"Finalizar Baixa"** → fluxo atual (atualiza `solicitacoes` com `status`, `valor_gasto_real`, `troco_real`, `data_baixa`, devolução de troco ao fundo). Confirmação obrigatória se total < entregue (avisa que troco será devolvido como diferença não gasta).
- Mostrar banner "Você tem N nota(s) salva(s) totalizando R$ X. Adicione mais ou finalize a baixa." quando há rascunho.
- Permitir excluir notas salvas (já há RLS para isso).

### 2. Indicação visual de "baixa parcial" 
Onde a lista de solicitações mostra status `entregue`, verificar se já existe pelo menos 1 nota em `solicitacao_notas` e mostrar badge adicional "Baixa parcial" (ex.: `src/pages/user/MinhasSolicitacoes.tsx` e admin equivalente).

- Buscar contagem de notas por solicitação (uma única query agregando) e exibir badge secundário quando count > 0 e status = `entregue`.

### 3. Componente `NotasFiscaisManager`
Já suporta lista controlada — só precisa pré-popular com notas existentes do banco e marcar quais já estão persistidas (não reupload). Adicionar prop `notasExistentes` e tratar exclusão (delete em `solicitacao_notas` + remoção do storage).

### 4. Sem mudança de schema
Não precisa nova coluna nem novo status: a presença de registros em `solicitacao_notas` com status ainda `entregue` já indica "baixa parcial em andamento".

## Arquivos afetados

- `src/pages/user/Baixa.tsx` — dois botões, carregar notas existentes, lógica de rascunho.
- `src/components/baixa/NotasFiscaisManager.tsx` — suportar notas pré-existentes (marcador `persisted`) e exclusão.
- `src/pages/user/MinhasSolicitacoes.tsx` (ou onde lista solicitações `entregue`) — badge "Baixa parcial".
- (Opcional) `src/pages/admin/Solicitacoes.tsx` e `src/pages/admin/BaixasPendentes.tsx` — mesmo badge para admin enxergar.

Sem migrações de banco. Sem novos secrets.