## Objetivo

Fechar `leitor-notas` e `consultar-cnpj` (hoje públicas) e restringir CORS nas três edge functions, sem mexer no front-end.

## Mudanças

### 1. `supabase/config.toml`
Trocar `verify_jwt = false` → `true` em `[functions.leitor-notas]` e `[functions.consultar-cnpj]`.

### 2. `supabase/functions/leitor-notas/index.ts`
- Remover o `const corsHeaders` do topo (linhas 4-7).
- No início do handler `serve(async (req) => { ... })`, antes do `if (req.method === 'OPTIONS')`:
  - Construir `corsHeaders` dinamicamente com whitelist `['https://fundofixo.lovable.app', 'http://localhost:8080']`, fallback para o primeiro, header `Vary: Origin`.
- Logo após o tratamento de `OPTIONS` e antes do `try { ... }` principal: validar `Authorization: Bearer ...` e `userClient.auth.getUser()`. Retornar 401 se ausente/ inválido.
- Manter intacto o cliente `service_role` que lê `ai_config` (uso correto para bypass de RLS).

### 3. `supabase/functions/consultar-cnpj/index.ts`
- Mesma transformação: remover `corsHeaders` do topo, recriar dinamicamente no handler com whitelist + `Vary`.
- Mesmo bloco de validação de auth (após OPTIONS, antes do `try`). Adicionar `import { createClient }` já existe.

### 4. `supabase/functions/check-openai-key/index.ts`
- Apenas trocar o `corsHeaders` estático por construção dinâmica no topo do handler (mesma whitelist + `Vary`). Validação de auth e role admin já existem — não tocar.

## Detalhes técnicos

- `verify_jwt = true` faz a plataforma rejeitar requests sem JWT antes de chegar no código; a validação extra dentro da function é redundância defensiva e dá acesso ao `user.id` se precisar depois.
- CORS dinâmico devolve o origin exato quando está na whitelist; navegadores fora da whitelist recebem o origin canônico (`fundofixo.lovable.app`) e o browser bloqueia. Não é proteção real (curl ignora CORS) — a proteção real é o JWT —, mas reduz uso indevido a partir de outros sites.
- `localhost:8080` na whitelist é só pra desenvolvimento local fora do Lovable; pode ser removido depois se quiser.
- `supabase.functions.invoke()` no front já injeta o JWT do usuário logado: nenhum ajuste em `src/**` necessário.

## Critério de aceitação

- `config.toml` com `verify_jwt = true` nas duas functions.
- `leitor-notas` e `consultar-cnpj` retornam 401 sem JWT.
- Importar nota e consultar CNPJ pelo app continuam funcionando para usuário logado.
- `check-openai-key` continua funcionando para admin.

## Não será feito

- Nenhuma mudança em `src/**`.
- Lógica interna das functions intacta.
- `check-openai-key` mantém auth+role atuais.
