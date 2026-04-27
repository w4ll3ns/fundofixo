## Confirmação antes de excluir nota fiscal anexada

### Mudança única
**`src/components/baixa/NotasFiscaisManager.tsx`**:

1. Importar `AlertDialog` e subcomponentes de `@/components/ui/alert-dialog`.
2. Adicionar estado `notaToRemove: NotaFiscalItem | null`.
3. No botão da lixeira (linha 274), trocar `onClick={() => handleRemove(n.id)}` por `onClick={() => setNotaToRemove(n)}`.
4. Renderizar `AlertDialog` no fim do JSX:
   - Título: **"Remover nota fiscal?"**
   - Descrição mostra emitente/número/valor da nota selecionada e avisa que a ação não pode ser desfeita.
   - Botão "Cancelar" e botão destrutivo "Remover" que chama `handleRemove(notaToRemove.id)` e limpa o estado.

Sem mudanças de schema, RLS ou outros componentes.