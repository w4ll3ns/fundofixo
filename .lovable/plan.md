## Verificação prévia (PARTE 1)

Executei a query de duplicatas de CNPJ em `public.empresas`:

```
SELECT cnpj, COUNT(*) FROM public.empresas GROUP BY cnpj HAVING COUNT(*) > 1;
→ 0 linhas
```

**Sem duplicatas.** Posso aplicar a migration completa com segurança, incluindo o `UNIQUE` em `empresas.cnpj`.

Verificação adicional: `fundos.empresa_id` já tem constraint `UNIQUE` (`fundos_empresa_id_key`), então o `ON CONFLICT (empresa_id) DO NOTHING` no trigger e no back-fill funciona corretamente.

> Nota: existe uma memória do projeto que diz "CNPJ is NOT unique/PK. Multiple branches can share CNPJ". Adicionar `UNIQUE(cnpj)` agora **muda essa regra de negócio** — passará a ser proibido cadastrar duas filiais com o mesmo CNPJ. Como você pediu explicitamente o constraint e o banco hoje não tem duplicatas, vou aplicar e atualizar a memória após a execução. Se quiser manter a regra antiga, me avise antes de aprovar.

## Migration (PARTE 2)

Criar **uma única** migration `hardening_rls_constraints_e_trigger_fundo` com os 6 blocos exatamente como você especificou:

1. **RLS `notificacoes`** — drop `"System can insert notifications"`, criar `"Only admin or self can insert notifications"` com `WITH CHECK (user_id = auth.uid() OR has_role(auth.uid(), 'admin'))`.
2. **RLS UPDATE `solicitacoes`** — drop e recriar `"Users can update own solicitacoes when allowed"` adicionando `WITH CHECK (solicitante_user_id = auth.uid())`.
3. **`ALTER TABLE empresas ADD CONSTRAINT empresas_cnpj_unique UNIQUE (cnpj)`**.
4. **`ALTER TABLE solicitacoes ADD CONSTRAINT chk_valor_solicitado_positivo CHECK (valor_solicitado > 0)`**.
5. **Trigger `trg_empresa_criar_fundo`** + função `criar_fundo_empresa()` (`SECURITY DEFINER`, `search_path = public`) que insere em `fundos` no `AFTER INSERT` em `empresas`, com `ON CONFLICT (empresa_id) DO NOTHING`.
6. **Back-fill** — `INSERT INTO fundos` para toda empresa sem fundo correspondente.

## Fora de escopo (não vou fazer)

- Nenhuma alteração em código TypeScript/React.
- Nenhuma outra policy mexida.
- Nenhuma RPC criada (fica pra Etapa 4).

## Pós-migration

- Atualizar a memória `mem://data-model/company-cnpj-constraint` para refletir que CNPJ agora é UNIQUE.
- Confirmar via `supabase--read_query` que: a policy antiga sumiu, a nova existe, o constraint UNIQUE existe, o CHECK existe, o trigger existe, e que `count(empresas) == count(fundos)` após o back-fill.