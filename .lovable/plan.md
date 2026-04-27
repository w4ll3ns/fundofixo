## Plano: documentação de variáveis de ambiente

### O que será feito

**1. Criar `.env.example` na raiz**

Arquivo só com as chaves (sem valores), servindo de documentação para quem clonar o repositório fora do Lovable:

```
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
```

**2. Atualizar `README.md`**

- Substituir as 3 ocorrências de `REPLACE_WITH_PROJECT_ID` por `<seu-project-id>`.
- Adicionar uma nova seção `## Variáveis de ambiente` logo após `## Project info`, contendo:
  - Lista das três variáveis usadas pelo frontend.
  - Instrução: copiar `.env.example` para `.env` e preencher os valores ao desenvolver localmente fora do Lovable.
  - Nota de que, dentro do Lovable Cloud, o `.env` é provisionado automaticamente — não é preciso configurar manualmente.
  - Esclarecimento de que `VITE_SUPABASE_PUBLISHABLE_KEY` é uma **chave pública (anon key)**, projetada para ir no bundle do frontend; a segurança real vem das políticas RLS do banco. Segredos sensíveis (service role, APIs de terceiros) ficam no cofre de secrets do Lovable Cloud, não em `.env`.

### O que NÃO será feito (e por quê)

- **Não editar `.gitignore`** — no Lovable o versionamento é gerenciado pela plataforma; alterações nesse arquivo não produzem o efeito de um repositório local tradicional.
- **Não tocar no `.env`** — é um arquivo autogerado pelo Lovable Cloud (regra explícita: nunca editar manualmente). Ele será recriado a cada build com as variáveis corretas.

### Critério de aceitação ajustado

- `.env.example` existe na raiz com as 3 chaves vazias.
- README sem mais `REPLACE_WITH_PROJECT_ID` e com a nova seção `## Variáveis de ambiente`.
