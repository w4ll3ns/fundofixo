import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate, maskCNPJ } from '@/lib/masks';
import { Badge } from '@/components/ui/badge';
import { Bot, FileText, Loader2 } from 'lucide-react';
import { NotaFiscalPreview } from '@/components/solicitacoes/NotaFiscalPreview';

interface NotaRow {
  id: string;
  valor: number;
  upload_url: string;
  data_emissao: string | null;
  numero_nota: string | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  descricao: string | null;
  ai_valor_extraido: number | null;
  ai_confianca: 'alta' | 'media' | 'baixa' | null;
}

interface LegacyFallback {
  upload_nota_fiscal_url?: string | null;
  numero_nota?: string | null;
  nome_emitente?: string | null;
  cnpj_emitente?: string | null;
  data_emissao_nota?: string | null;
  ai_valor_extraido?: number | null;
  ai_confianca?: 'alta' | 'media' | 'baixa' | null;
  valor_gasto_real?: number | null;
}

interface Props {
  solicitacaoId: string;
  /** Dados legados em `solicitacoes` para fallback quando não há registros em solicitacao_notas */
  legacy?: LegacyFallback;
}

export function NotasFiscaisList({ solicitacaoId, legacy }: Props) {
  const [notas, setNotas] = useState<NotaRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from('solicitacao_notas')
        .select('id, valor, upload_url, data_emissao, numero_nota, nome_emitente, cnpj_emitente, descricao, ai_valor_extraido, ai_confianca')
        .eq('solicitacao_id', solicitacaoId)
        .order('created_at', { ascending: true });
      if (!cancelled) {
        setNotas((data as NotaRow[]) || []);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [solicitacaoId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Fallback para baixas antigas (sem registros em solicitacao_notas)
  if (!notas || notas.length === 0) {
    if (legacy?.upload_nota_fiscal_url) {
      return (
        <div className="space-y-3">
          <NotaFiscalCard
            index={1}
            valor={legacy.valor_gasto_real || legacy.ai_valor_extraido || 0}
            upload_url={legacy.upload_nota_fiscal_url}
            data_emissao={legacy.data_emissao_nota || null}
            numero_nota={legacy.numero_nota || null}
            nome_emitente={legacy.nome_emitente || null}
            cnpj_emitente={legacy.cnpj_emitente || null}
            ai_confianca={legacy.ai_confianca || null}
            ai_valor_extraido={legacy.ai_valor_extraido || null}
            descricao={null}
            single
          />
        </div>
      );
    }
    return <p className="text-sm text-muted-foreground">Nenhuma nota fiscal anexada.</p>;
  }

  return (
    <div className="space-y-3">
      {notas.length > 1 && (
        <p className="text-sm text-muted-foreground">{notas.length} notas anexadas</p>
      )}
      {notas.map((n, idx) => (
        <NotaFiscalCard key={n.id} index={idx + 1} {...n} single={notas.length === 1} />
      ))}
    </div>
  );
}

function NotaFiscalCard(props: {
  index: number;
  valor: number;
  upload_url: string;
  data_emissao: string | null;
  numero_nota: string | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  descricao: string | null;
  ai_valor_extraido: number | null;
  ai_confianca: 'alta' | 'media' | 'baixa' | null;
  single?: boolean;
}) {
  const { index, valor, upload_url, data_emissao, numero_nota, nome_emitente, cnpj_emitente, descricao, ai_valor_extraido, ai_confianca, single } = props;

  return (
    <div className="border border-border rounded-lg p-3 space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          {!single && (
            <div className="bg-primary/10 text-primary rounded h-7 w-7 flex items-center justify-center text-sm font-semibold flex-shrink-0">
              {index}
            </div>
          )}
          <div className="min-w-0">
            <p className="font-medium truncate flex items-center gap-2">
              <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
              {nome_emitente || 'Nota fiscal'}
            </p>
            <p className="text-xs text-muted-foreground">
              {numero_nota ? `Nº ${numero_nota}` : '—'}
              {data_emissao ? ` • ${formatDate(data_emissao)}` : ''}
              {cnpj_emitente ? ` • ${maskCNPJ(cnpj_emitente)}` : ''}
            </p>
          </div>
        </div>
        <div className="text-right flex-shrink-0">
          <p className="font-semibold">{formatCurrency(Number(valor))}</p>
          {ai_confianca && (
            <Badge variant={ai_confianca === 'alta' ? 'default' : ai_confianca === 'media' ? 'secondary' : 'destructive'} className="text-[10px] mt-1 gap-1">
              <Bot className="h-3 w-3" />
              {ai_confianca}
            </Badge>
          )}
        </div>
      </div>
      {descricao && (
        <p className="text-sm text-muted-foreground border-t pt-2">{descricao}</p>
      )}
      <NotaFiscalPreview filePath={upload_url} />
    </div>
  );
}
