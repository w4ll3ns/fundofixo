# Fix: erro `record "new" has no field "updated_at"` ao excluir/atualizar histórico do fundo

## Causa raiz

A tabela `public.historico_fundos` **não tem** a coluna `updated_at`, mas existe um trigger BEFORE UPDATE chamado `update_historico_fundos_updated_at` que executa `update_updated_at_column()`, função que tenta atribuir `NEW.updated_at = now()`. Qualquer UPDATE nessa tabela dispara o erro.

Isso afeta fluxos como exclusão de baixa pendente / qualquer ajuste que toque registros do histórico.

## Correção

Remover o trigger inválido. A tabela `historico_fundos` é append-only (auditoria) e não precisa de `updated_at`.

```sql
DROP TRIGGER IF EXISTS update_historico_fundos_updated_at ON public.historico_fundos;
```

## Verificação dos demais triggers `update_*_updated_at`

Confirmado que os outros estão OK (têm a coluna `updated_at`):
- `empresas` ✓
- `fundos` ✓
- `profiles` ✓
- `solicitacoes` ✓

Só `historico_fundos` está quebrado.

## Fora de escopo

- Nenhuma mudança de código de aplicação é necessária.
