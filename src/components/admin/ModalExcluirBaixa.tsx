import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/masks';
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react';

interface SolicitacaoExclusao {
  id: string;
  empresa_id: string;
  solicitante_user_id: string;
  tipo_solicitacao?: 'FUNDO_FIXO' | 'COMPRA_AVULSA' | string;
  valor_solicitado: number;
  valor_entregue: number | null;
  data_aprovacao: string | null;
  upload_nota_fiscal_url: string | null;
  empresas?: { nome_fantasia: string } | null;
  profiles?: { nome: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solicitacao: SolicitacaoExclusao | null;
  onSuccess: () => void;
}

export function ModalExcluirBaixa({ open, onOpenChange, solicitacao, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [motivo, setMotivo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!solicitacao) return null;

  const valorEntregue = Number(solicitacao.valor_entregue || 0);
  const isFundoFixo = (solicitacao.tipo_solicitacao || 'FUNDO_FIXO') === 'FUNDO_FIXO';
  const vaiEstornar = isFundoFixo && valorEntregue > 0;

  const reset = () => {
    setMotivo('');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    if (motivo.trim().length < 10) {
      toast({
        title: 'Motivo obrigatório',
        description: 'Descreva o motivo da exclusão (mín. 10 caracteres).',
        variant: 'destructive',
      });
      return;
    }
    setSubmitting(true);
    try {
      // 1. Estorno de saldo (apenas FUNDO_FIXO com valor entregue)
      if (vaiEstornar) {
        const { data: fundo, error: fundoFetchErr } = await supabase
          .from('fundos')
          .select('id, saldo_atual')
          .eq('empresa_id', solicitacao.empresa_id)
          .maybeSingle();
        if (fundoFetchErr) throw fundoFetchErr;

        if (fundo) {
          const saldoAnterior = Number(fundo.saldo_atual);
          const novoSaldo = saldoAnterior + valorEntregue;

          const { error: fundoUpdErr } = await supabase
            .from('fundos')
            .update({ saldo_atual: novoSaldo })
            .eq('id', fundo.id);
          if (fundoUpdErr) throw fundoUpdErr;

          const { error: histErr } = await supabase.from('historico_fundos').insert({
            fundo_id: fundo.id,
            solicitacao_id: solicitacao.id,
            tipo: 'ajuste',
            valor: valorEntregue,
            saldo_anterior: saldoAnterior,
            saldo_posterior: novoSaldo,
            descricao: `Estorno por exclusão de baixa pendente (${solicitacao.profiles?.nome || 'usuário'}). Motivo: ${motivo.trim()}`,
            admin_id: user?.id,
          });
          if (histErr) throw histErr;
        }
      }

      // 2. Remove arquivo do storage (se houver)
      if (solicitacao.upload_nota_fiscal_url) {
        await supabase.storage
          .from('notas-fiscais')
          .remove([solicitacao.upload_nota_fiscal_url])
          .catch(() => {
            // não bloqueia exclusão se arquivo já não existe
          });
      }

      // 3. Apaga notificações vinculadas (evita link quebrado)
      await supabase
        .from('notificacoes')
        .delete()
        .ilike('link', `%/solicitacao/${solicitacao.id}%`);

      // 4. Apaga a solicitação
      const { error: delErr } = await supabase
        .from('solicitacoes')
        .delete()
        .eq('id', solicitacao.id);
      if (delErr) throw delErr;

      // 5. Notifica solicitante
      await supabase.from('notificacoes').insert({
        user_id: solicitacao.solicitante_user_id,
        titulo: 'Baixa pendente cancelada',
        mensagem: `Sua baixa pendente de ${formatCurrency(valorEntregue || solicitacao.valor_solicitado)} foi cancelada pelo administrador. Motivo: ${motivo.trim()}`,
        tipo: 'warning',
        link: null,
      });

      toast({ title: 'Baixa pendente excluída com sucesso' });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const error = err as Error;
      toast({
        title: 'Erro ao excluir baixa',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Trash2 className="h-5 w-5 text-destructive" />
            Excluir baixa pendente
          </DialogTitle>
          <DialogDescription>
            Esta ação remove a solicitação e reverte o impacto financeiro.
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-muted/50 col-span-2">
                <p className="text-xs text-muted-foreground">Empresa / Solicitante</p>
                <p className="font-medium">{solicitacao.empresas?.nome_fantasia || '-'}</p>
                <p className="text-muted-foreground">{solicitacao.profiles?.nome || '-'}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Valor entregue</p>
                <p className="font-bold">{formatCurrency(valorEntregue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Aprovado em</p>
                <p className="font-medium">
                  {solicitacao.data_aprovacao ? formatDate(solicitacao.data_aprovacao) : '-'}
                </p>
              </div>
            </div>

            <Alert variant={vaiEstornar ? 'default' : 'default'}>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                {vaiEstornar ? (
                  <>
                    O valor de <strong>{formatCurrency(valorEntregue)}</strong> será{' '}
                    <strong>estornado</strong> ao saldo do fundo fixo da empresa e registrado no
                    histórico como <em>estorno</em>.
                  </>
                ) : (
                  <>
                    Esta solicitação não impacta o saldo do fundo. A exclusão removerá o registro e
                    notificará o solicitante.
                  </>
                )}
                {solicitacao.upload_nota_fiscal_url && (
                  <> O arquivo de nota fiscal anexado também será removido.</>
                )}
              </AlertDescription>
            </Alert>

            <div className="space-y-2">
              <Label htmlFor="motivo-exclusao">Motivo da exclusão *</Label>
              <Textarea
                id="motivo-exclusao"
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: solicitação duplicada, criada por engano, valor incorreto..."
                rows={3}
              />
              <p className="text-xs text-muted-foreground">Mínimo 10 caracteres.</p>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Excluir baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
