# Seletor de Provedor IA com Chave OpenAI Segura

Adicionar configuração administrativa para escolher entre **Lovable AI** (padrão) e **OpenAI própria**, com gestão segura da chave via secret backend.

## 1. Migration — tabela `ai_config`

Singleton (1 linha) para armazenar preferência de provedor:

- `id` uuid PK default gen_random_uuid()
- `provider` text NOT NULL default `'lovable'` — valores: `'lovable'` ou `'openai'`
- `openai_model` text default `'gpt-4o'`
- `lovable_model` text default `'google/gemini-2.5-flash'`
- `updated_at` timestamptz default now()
- `updated_by` uuid

**RLS**: SELECT e UPDATE apenas para admins via `has_role(auth.uid(), 'admin')`. Edge functions usam service role para ler.

A **chave OpenAI nunca é gravada nessa tabela** — fica no secret `OPENAI_API_KEY` da Lovable Cloud (criptografado).

## 2. Edge Functions

### `leitor-notas` (refatorar existente)
- Lê `ai_config.provider`
- Se `'lovable'`: fluxo atual (LOVABLE_API_KEY + gateway)
- Se `'openai'`:
  - JPG/PNG → `https://api.openai.com/v1/chat/completions` com `gpt-4o` (image_url base64)
  - PDF → `https://api.openai.com/v1/responses` com `input_file` (suporte nativo)
  - Mantém tool calling para extração estruturada
- Erros tratados: 401 (chave inválida), 429 (rate limit), 402/insufficient_quota (sem créditos)
- Se provider=openai mas secret ausente → mensagem clara para configurar em /admin/configuracoes

### `set-openai-key` (nova)
- Valida JWT + role admin
- Recebe `{ api_key }`, valida formato (`sk-...`, ≥40 chars)
- Faz call de teste a `https://api.openai.com/v1/models` para confirmar
- Se válida, persiste como secret via Supabase Management API
- Retorna apenas `{ ok: true, masked: "sk-...XXXX" }` — nunca a chave em si

## 3. Frontend — Aba "Inteligência Artificial" em `/admin/configuracoes`

- **Radio**: Lovable AI (padrão) | OpenAI (minha chave)
- Se OpenAI: select de modelo (gpt-4o, gpt-4o-mini, gpt-4-turbo)
- Campo password "Chave API OpenAI":
  - Botão olho (mostrar/ocultar)
  - Validação zod: `sk-` + ≥40 chars
  - Mostra mascarada se já configurada (`sk-•••••XXXX`)
  - Botão "Testar e salvar" → chama `set-openai-key`
  - Link "Onde obter minha chave?" → platform.openai.com/api-keys
- Badge status: verde "Conectado" / vermelho "Não configurado"
- Aviso: "Sua chave é armazenada criptografada no backend e nunca exposta ao navegador"

## Segurança aplicada

- Chave nunca trafega de volta ao frontend após salva
- Input password + autocomplete=off
- Validação zod no client e na edge function
- Edge functions checam `has_role(admin)` antes de qualquer operação
- RLS em `ai_config` restrita a admins
- Teste de validade antes de persistir
- Secret gerenciado pela Lovable Cloud (criptografado)

## Custo estimado OpenAI

`gpt-4o`: ~US$ 0,01–0,03 por nota fiscal lida.

## Ordem de implementação

1. Migration `ai_config` + RLS
2. Solicitar secret `OPENAI_API_KEY` (você cola a chave)
3. Refatorar `leitor-notas` com lógica dual-provider
4. Criar `set-openai-key`
5. Aba "Inteligência Artificial" em `/admin/configuracoes`
