import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/masks';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotasFiscaisManager, NotaFiscalItem } from '@/components/baixa/NotasFiscaisManager';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number;
  status: string;
  empresa_id: string;
  empresas: { nome_fantasia: string } | null;
}

export default function Baixa() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [notas, setNotas] = useState<NotaFiscalItem[]>([]);

  useEffect(() => {
    const fetch = async () => {
      if (!id) return;
      const [{ data }, { data: { user } }] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select('id, valor_solicitado, valor_entregue, status, empresa_id, empresas(nome_fantasia)')
          .eq('id', id)
          .maybeSingle(),
        supabase.auth.getUser(),
      ]);
      if (data) setSolicitacao(data as unknown as Solicitacao);
      if (user) setUserId(user.id);
      setLoading(false);
    };
    fetch();
  }, [id]);

  const valorGasto = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
  const trocoReal = solicitacao ? (solicitacao.valor_entregue || 0) - valorGasto : 0;

  const handleSubmit = async () => {
    if (!solicitacao || notas.length === 0) return;

    setSubmitting(true);
    const newStatus = trocoReal < 0 ? 'pendente_ajuste' : 'baixada';

    // primeira nota -> campos legados em solicitacoes (compatibilidade + competência mensal)
    const primeira = notas[0];
    const descricaoConcat = notas.map(n => n.descricao).filter(Boolean).join(' | ') || null;

    const { error } = await supabase.from('solicitacoes').update({
      status: newStatus,
      valor_gasto_real: valorGasto,
      descricao_compra: descricaoConcat,
      upload_nota_fiscal_url: primeira.upload_url,
      troco_real: trocoReal,
      data_baixa: new Date().toISOString(),
      data_emissao_nota: primeira.data_emissao || null,
      numero_nota: primeira.numero_nota || null,
      nome_emitente: primeira.nome_emitente || null,
      cnpj_emitente: primeira.cnpj_emitente || null,
      ai_valor_extraido: primeira.ai_valor_extraido || null,
      ai_confianca: (primeira.ai_confianca as 'alta' | 'media' | 'baixa' | null) || null,
      ai_evidencia: primeira.ai_evidencia || null,
      ai_status: primeira.ai_status || 'pendente',
      ai_processed_at: primeira.ai_processed_at || new Date().toISOString(),
    }).eq('id', solicitacao.id);

    if (error) {
      toast({ title: 'Erro ao salvar baixa', description: error.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // insert em solicitacao_notas
    const rows = notas.map(n => ({
      solicitacao_id: solicitacao.id,
      valor: n.valor,
      upload_url: n.upload_url,
      arquivo_hash: n.arquivo_hash || null,
      data_emissao: n.data_emissao || null,
      numero_nota: n.numero_nota || null,
      nome_emitente: n.nome_emitente || null,
      cnpj_emitente: n.cnpj_emitente || null,
      descricao: n.descricao || null,
      ai_valor_extraido: n.ai_valor_extraido || null,
      ai_confianca: n.ai_confianca || null,
      ai_evidencia: n.ai_evidencia || null,
      ai_status: n.ai_status || null,
      ai_processed_at: n.ai_processed_at || null,
      created_by: userId,
    }));
    const { error: insertErr } = await supabase.from('solicitacao_notas').insert(rows);
    if (insertErr) {
      toast({ title: 'Erro ao salvar notas', description: insertErr.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

    // troco -> devolver ao fundo
    if (trocoReal > 0 && newStatus === 'baixada') {
      const { data: fundo } = await supabase
        .from('fundos')
        .select('id, saldo_atual')
        .eq('empresa_id', solicitacao.empresa_id)
        .maybeSingle();

      if (fundo) {
        const novoSaldo = Number(fundo.saldo_atual) + trocoReal;
        await supabase.from('fundos').update({ saldo_atual: novoSaldo }).eq('id', fundo.id);
        await supabase.from('historico_fundos').insert({
          fundo_id: fundo.id,
          solicitacao_id: solicitacao.id,
          tipo: 'devolucao_troco',
          valor: trocoReal,
          saldo_anterior: fundo.saldo_atual,
          saldo_posterior: novoSaldo,
          descricao: `Troco devolvido da solicitação`,
        });
      }
    }

    toast({ title: 'Baixa realizada com sucesso!' });
    navigate('/minhas-solicitacoes');
  };

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><Loader2 className="h-8 w-8 animate-spin" /></div></AppLayout>;
  }

  if (!solicitacao) {
    return <AppLayout><div className="text-center py-8">Solicitação não encontrada</div></AppLayout>;
  }

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Realizar Baixa</CardTitle>
            <CardDescription>
              {solicitacao.empresas?.nome_fantasia} • Valor entregue: {formatCurrency(solicitacao.valor_entregue)}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Anexe uma ou mais notas fiscais. O valor total será a soma de todas as notas.
              </p>
              <NotasFiscaisManager
                notas={notas}
                onChange={setNotas}
                storagePathPrefix={`${userId}/${solicitacao.id}`}
                inputIdPrefix="user-baixa"
              />
            </div>

            {notas.length > 0 && (
              <div className={cn(
                'p-4 rounded-lg',
                trocoReal > 0 ? 'bg-success/10' : trocoReal < 0 ? 'bg-warning/10' : 'bg-muted'
              )}>
                <div className="grid gap-2 sm:grid-cols-3 text-center">
                  <div>
                    <p className="text-xs text-muted-foreground">Entregue</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_entregue)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Gasto</p>
                    <p className="font-medium">{formatCurrency(valorGasto)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      {trocoReal > 0 ? 'Troco a devolver' : trocoReal < 0 ? 'Diferença a ajustar' : 'Troco'}
                    </p>
                    <p className={cn(
                      'font-bold',
                      trocoReal > 0 ? 'text-success' : trocoReal < 0 ? 'text-warning' : ''
                    )}>
                      {formatCurrency(Math.abs(trocoReal))}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="flex gap-4">
              <Button variant="outline" onClick={() => navigate(-1)} className="flex-1">Cancelar</Button>
              <Button
                onClick={() => setConfirmDialogOpen(true)}
                disabled={notas.length === 0 || valorGasto <= 0}
                className="flex-1"
              >
                Confirmar Baixa
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmar Baixa</DialogTitle>
              <DialogDescription>Revise os dados antes de confirmar</DialogDescription>
            </DialogHeader>
            <DialogBody>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Solicitado</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_solicitado)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Entregue</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_entregue)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Total Gasto ({notas.length} {notas.length === 1 ? 'nota' : 'notas'})</p>
                    <p className="font-medium">{formatCurrency(valorGasto)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">{trocoReal >= 0 ? 'Troco' : 'Diferença'}</p>
                    <p className={cn('font-medium', trocoReal > 0 ? 'text-success' : trocoReal < 0 ? 'text-warning' : '')}>
                      {formatCurrency(Math.abs(trocoReal))}
                    </p>
                  </div>
                </div>
                {trocoReal < 0 && (
                  <div className="p-3 rounded-lg bg-warning/10 text-sm">
                    O gasto excedeu o valor entregue. A baixa será marcada como <strong>pendente de ajuste</strong>.
                  </div>
                )}
              </div>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={() => setConfirmDialogOpen(false)} disabled={submitting}>Cancelar</Button>
              <Button onClick={handleSubmit} disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                Confirmar
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
