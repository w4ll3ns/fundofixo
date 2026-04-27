import { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface DivergenciaSaldo {
  fundo_id: string;
  empresa_id: string;
  empresa_nome: string;
  saldo_atual: number;
  saldo_esperado: number;
  diferenca: number; // esperado - atual
  ultima_movimentacao_em: string | null;
}

const TOLERANCIA = 0.01;

export function useAuditoriaSaldos() {
  const [divergencias, setDivergencias] = useState<DivergenciaSaldo[]>([]);
  const [loading, setLoading] = useState(true);

  const auditar = useCallback(async () => {
    setLoading(true);
    const { data: fundos, error } = await supabase
      .from('fundos')
      .select('id, empresa_id, saldo_atual, empresas(id, nome_fantasia, unidade)');

    if (error || !fundos) {
      setDivergencias([]);
      setLoading(false);
      return;
    }

    const resultados: DivergenciaSaldo[] = [];

    await Promise.all(
      fundos.map(async (f: any) => {
        // Soma todos os lançamentos do histórico aplicando o sinal correto por tipo.
        // Mais robusto que confiar no saldo_posterior do "último" lançamento (que pode falhar
        // quando vários inserts compartilham o mesmo created_at).
        const { data: lancamentos } = await supabase
          .from('historico_fundos')
          .select('tipo, valor, created_at')
          .eq('fundo_id', f.id)
          .order('created_at', { ascending: false });

        const TIPOS_CREDITO = new Set(['entrada', 'adicao', 'devolucao_troco']);
        const TIPOS_DEBITO = new Set(['saida', 'retirada', 'solicitacao_retroativa']);
        // 'ajuste' já vem com sinal embutido no valor

        let saldoEsperado = 0;
        let ultimoCreatedAt: string | null = null;
        for (const l of lancamentos ?? []) {
          const v = Number(l.valor);
          if (TIPOS_CREDITO.has(l.tipo)) saldoEsperado += v;
          else if (TIPOS_DEBITO.has(l.tipo)) saldoEsperado -= v;
          else saldoEsperado += v; // ajuste e outros já com sinal
          if (!ultimoCreatedAt) ultimoCreatedAt = l.created_at;
        }
        saldoEsperado = Number(saldoEsperado.toFixed(2));

        const saldoAtual = Number(f.saldo_atual);
        const diferenca = Number((saldoEsperado - saldoAtual).toFixed(2));

        if (Math.abs(diferenca) >= TOLERANCIA) {
          const nome = f.empresas?.nome_fantasia
            ? `${f.empresas.nome_fantasia}${f.empresas.unidade ? ` - ${f.empresas.unidade}` : ''}`
            : 'Empresa';
          resultados.push({
            fundo_id: f.id,
            empresa_id: f.empresa_id,
            empresa_nome: nome,
            saldo_atual: saldoAtual,
            saldo_esperado: saldoEsperado,
            diferenca,
            ultima_movimentacao_em: ultimoCreatedAt,
          });
        }
      })
    );

    resultados.sort((a, b) => Math.abs(b.diferenca) - Math.abs(a.diferenca));
    setDivergencias(resultados);
    setLoading(false);
  }, []);

  useEffect(() => {
    auditar();
  }, [auditar]);

  return { divergencias, loading, recarregar: auditar };
}
