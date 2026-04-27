## Problema

A nota enviada pela usuária Stefhane não foi lida pela IA. Os logs mostram apenas:
- `AI provider: openai`
- `AI raw response length: 392`

Não houve erro HTTP — a OpenAI respondeu (392 chars), mas a função **não loga o conteúdo bruto**, então não dá para saber se:
1. A IA respondeu `{"notas_encontradas": 0, "notas": []}` (não conseguiu ler o PDF).
2. A IA respondeu em formato inválido (markdown, texto livre) e o parse falhou silenciosamente.
3. A Responses API da OpenAI retornou em campo diferente (`output_text` ausente).

392 chars é compatível com uma resposta vazia (`notas_encontradas: 0`) ou um JSON com 1 nota mínima. Sem o texto, é impossível decidir.

## Diagnóstico encontrado no código (`leitor-notas/index.ts`)

1. **Falta log do conteúdo bruto** (linha 242 só loga `length`).
2. **Parse silencioso**: quando falha, retorna `notas_encontradas: 0` com erro genérico, sem registrar o que veio.
3. **Modelo padrão `gpt-4o-mini`** (configurado no banco) tem qualidade inferior para PDFs via Responses API; `gpt-4o` é mais confiável para extração estruturada de NFs.
4. **Prompt OpenAI Responses** não força `response_format: json_object` nem usa o modo estruturado — depende só da instrução textual.

## Plano de correção

### 1. Diagnóstico (logs) — `supabase/functions/leitor-notas/index.ts`
- Logar os primeiros 500 chars do `content` retornado pela IA (mascarando se necessário).
- No `catch (parseError)`, logar o conteúdo completo que falhou no parse.
- Logar `data` cru da Responses API quando `text` ficar vazio, para confirmar o caminho de extração.

### 2. Robustez do parse
- Aceitar JSON envolvido em texto: extrair primeiro bloco `{...}` via regex se `JSON.parse` direto falhar.
- Adicionar fallback: se `notas_encontradas: 0` mas `total_value` ou campos top-level existirem, normalizar para o formato esperado.

### 3. Forçar JSON estruturado na OpenAI
- No request à Responses API, adicionar `text: { format: { type: "json_object" } }` para garantir saída JSON válida.
- Idem no Chat Completions (imagens): `response_format: { type: "json_object" }`.

### 4. Modelo recomendado para PDFs
- Se `provider === 'openai'` e `isPDF`, usar `gpt-4o` mesmo que `openai_model` esteja como `gpt-4o-mini` (mini tem qualidade insuficiente para extração de NF em PDF). Logar quando o upgrade ocorrer.
- Alternativamente, atualizar a UI da aba IA para recomendar `gpt-4o` como padrão.

### 5. Retorno mais informativo ao frontend
- Quando o parse falhar, devolver `error` com uma amostra do conteúdo recebido (truncada) para o admin ver no toast/console e poder reportar.

## Próximo passo após aprovação

Após aplicar essas mudanças, peço para a Stefhane (ou você) reenviar a mesma nota. Com os novos logs vou identificar exatamente o motivo (modelo fraco, formato inesperado, PDF ilegível) e ajustar pontualmente.

## Arquivos afetados

- `supabase/functions/leitor-notas/index.ts` — logs, parse robusto, `json_object`, upgrade automático de modelo para PDFs.
- (Opcional) `src/pages/admin/configuracoes/InteligenciaArtificial.tsx` — destacar `gpt-4o` como recomendado para NFs em PDF.

Sem migrações de banco. Sem novos secrets.