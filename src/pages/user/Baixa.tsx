import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/masks';
import { ArrowLeft, Loader2, Save, FileCheck2, Info } from 'lucide-react';
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

type ExistingNota = NotaFiscalItem & { dbId: string };

export default function Baixa() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [solicitacao, setSolicitacao] = useState<Solicitacao | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [confirmDialogOpen, setConfirmDialogOpen] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);
  const [notas, setNotas] = useState<NotaFiscalItem[]>([]);
  // ids no banco -> usados para detectar removidos no rascunho/finalização
  const [originalDbIds, setOriginalDbIds] = useState<Map<string, string>>(new Map()); // localId -> dbId

  useEffect(() => {
    const fetchData = async () => {
      if (!id) return;
      const [{ data: sol }, { data: { user } }, { data: existingNotas }] = await Promise.all([
        supabase
          .from('solicitacoes')
          .select('id, valor_solicitado, valor_entregue, status, empresa_id, empresas(nome_fantasia)')
          .eq('id', id)
          .maybeSingle(),
        supabase.auth.getUser(),
        supabase
          .from('solicitacao_notas')
          .select('*')
          .eq('solicitacao_id', id)
          .order('created_at', { ascending: true }),
      ]);

      if (sol) setSolicitacao(sol as unknown as Solicitacao);
      if (user) setUserId(user.id);

      if (existingNotas && existingNotas.length > 0) {
        const map = new Map<string, string>();
        const items: NotaFiscalItem[] = existingNotas.map((n: any) => {
          const localId = crypto.randomUUID();
          map.set(localId, n.id);
          return {
            id: localId,
            valor: Number(n.valor),
            upload_url: n.upload_url,
            arquivo_hash: n.arquivo_hash,
            data_emissao: n.data_emissao,
            numero_nota: n.numero_nota,
            nome_emitente: n.nome_emitente,
            cnpj_emitente: n.cnpj_emitente,
            descricao: n.descricao,
            ai_valor_extraido: n.ai_valor_extraido,
            ai_confianca: n.ai_confianca,
            ai_evidencia: n.ai_evidencia,
            ai_status: n.ai_status,
            ai_processed_at: n.ai_processed_at,
            fileName: n.upload_url?.split('/').pop() || 'Nota salva',
          };
        });
        setOriginalDbIds(map);
        setNotas(items);
      }

      setLoading(false);
    };
    fetchData();
  }, [id]);

  const valorGasto = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
  const trocoReal = solicitacao ? (solicitacao.valor_entregue || 0) - valorGasto : 0;
  const hasDraft = originalDbIds.size > 0;

  /** Sincroniza solicitacao_notas: deleta removidas, insere novas. Atualiza nada na solicitacoes. */
  const syncNotasToDb = async (solId: string): Promise<boolean> => {
    // ids locais ainda presentes
    const presentLocalIds = new Set(notas.map(n => n.id));
    // dbIds que devem ser excluídos (estavam no banco mas foram removidos da lista)
    const toDelete: string[] = [];
    originalDbIds.forEach((dbId, localId) => {
      if (!presentLocalIds.has(localId)) toDelete.push(dbId);
    });

    if (toDelete.length > 0) {
      const { error } = await supabase.from('solicitacao_notas').delete().in('id', toDelete);
      if (error) {
        toast({ title: 'Erro ao remover notas antigas', description: error.message, variant: 'destructive' });
        return false;
      }
    }

    // novas (ainda não persistidas) = local id não está em originalDbIds
    const novasParaInserir = notas.filter(n => !originalDbIds.has(n.id));
    if (novasParaInserir.length > 0) {
      const rows = novasParaInserir.map(n => ({
        solicitacao_id: solId,
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
      const { error } = await supabase.from('solicitacao_notas').insert(rows);
      if (error) {
        toast({ title: 'Erro ao salvar notas', description: error.message, variant: 'destructive' });
        return false;
      }
    }
    return true;
  };

  const handleSaveDraft = async () => {
    if (!solicitacao) return;
    if (notas.length === 0) {
      toast({ title: 'Adicione pelo menos uma nota para salvar o rascunho', variant: 'destructive' });
      return;
    }
    setSavingDraft(true);
    const ok = await syncNotasToDb(solicitacao.id);
    setSavingDraft(false);
    if (!ok) return;
    toast({
      title: 'Rascunho salvo',
      description: 'Você pode voltar e adicionar mais notas antes de finalizar a baixa.',
    });
    navigate('/minhas-solicitacoes');
  };

  const handleSubmit = async () => {
    if (!solicitacao || notas.length === 0) return;

    setSubmitting(true);
    const newStatus = trocoReal < 0 ? 'pendente_ajuste' : 'baixada';

    // 1) Sincroniza solicitacao_notas (preserva o que já estava + insere novas + remove apagadas)
    const ok = await syncNotasToDb(solicitacao.id);
    if (!ok) {
      setSubmitting(false);
      return;
    }

    // 2) Atualiza campos legados na solicitacoes (compatibilidade + competência mensal)
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

    // 3) troco -> devolver ao fundo
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

  // Bloqueio: se já foi baixada, não permite reabrir
  const jaBaixada = solicitacao.status === 'baixada';

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
            {hasDraft && !jaBaixada && (
              <div className="flex items-start gap-3 p-3 rounded-lg bg-primary/10 border border-primary/20">
                <Info className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-primary">Baixa parcial em andamento</p>
                  <p className="text-muted-foreground">
                    Você tem {originalDbIds.size} nota{originalDbIds.size > 1 ? 's' : ''} salva{originalDbIds.size > 1 ? 's' : ''} totalizando{' '}
                    {formatCurrency(notas.filter(n => originalDbIds.has(n.id)).reduce((s, n) => s + Number(n.valor || 0), 0))}.
                    Adicione mais ou finalize a baixa.
                  </p>
                </div>
              </div>
            )}

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

            <div className="flex flex-col sm:flex-row gap-3">
              <Button variant="outline" onClick={() => navigate(-1)} className="sm:flex-1">
                Cancelar
              </Button>
              <Button
                variant="secondary"
                onClick={handleSaveDraft}
                disabled={notas.length === 0 || savingDraft || submitting}
                className="sm:flex-1 gap-2"
              >
                {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar rascunho
              </Button>
              <Button
                onClick={() => setConfirmDialogOpen(true)}
                disabled={notas.length === 0 || valorGasto <= 0 || savingDraft || submitting}
                className="sm:flex-1 gap-2"
              >
                <FileCheck2 className="h-4 w-4" />
                Finalizar baixa
              </Button>
            </div>
          </CardContent>
        </Card>

        <Dialog open={confirmDialogOpen} onOpenChange={setConfirmDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Finalizar Baixa</DialogTitle>
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
                {trocoReal > 0 && (
                  <div className="p-3 rounded-lg bg-success/10 text-sm">
                    O valor de <strong>{formatCurrency(trocoReal)}</strong> será devolvido ao fundo fixo como troco.
                    Se ainda faltam notas para anexar, prefira <strong>Salvar rascunho</strong>.
                  </div>
                )}
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
