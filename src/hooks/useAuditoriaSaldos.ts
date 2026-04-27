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
        const { data: ultimo } = await supabase
          .from('historico_fundos')
          .select('saldo_posterior, created_at')
          .eq('fundo_id', f.id)
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        const saldoEsperado = ultimo ? Number(ultimo.saldo_posterior) : 0;
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
            ultima_movimentacao_em: ultimo?.created_at ?? null,
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
