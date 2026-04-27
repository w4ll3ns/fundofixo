## Bug: cliente não lê a resposta multi-nota da IA

### Diagnóstico
O edge function `leitor-notas` retorna corretamente:
```json
{ "notas_encontradas": 1, "notas": [{ "total_value": 110.60, "extracted_fields": {...} }] }
```

Mas `NotasFiscaisManager.tsx` (linha 179) checa `!aiData?.total_value` no nível raiz — que é `undefined` neste formato. Resultado: sempre cai no toast "IA não conseguiu ler a nota" mesmo quando a extração funcionou.

### Correção
**`src/components/baixa/NotasFiscaisManager.tsx`** — no handler de upload (linhas ~175–190):

1. Após `invoke`, normalizar a resposta:
   ```ts
   const primeiraNota = aiData?.notas?.[0];
   const ai = primeiraNota
     ? { total_value: primeiraNota.total_value, confidence_label: primeiraNota.confidence_label, evidence_text: primeiraNota.evidence_text, extracted_fields: primeiraNota.extracted_fields }
     : aiData?.total_value
       ? aiData          // fallback retrocompat (formato antigo single-nota)
       : null;
   ```
2. Trocar a condição de erro para `if (aiErr || !ai?.total_value)`.
3. Usar `ai` (em vez de `aiData`) no preenchimento dos estados (`setValorDisplay`, `setDataEmissao`, etc.) e em `setAiResult(ai as AIResult)`.

### (Opcional, futuro)
Se um PDF tem **múltiplas notas**, hoje o cliente só usa a primeira. Posso adicionar suporte a multi-nota num próximo passo (gerar 1 item por nota detectada). Avisa se quiser que eu faça já junto.

Sem mudanças no backend nem em outros arquivos.