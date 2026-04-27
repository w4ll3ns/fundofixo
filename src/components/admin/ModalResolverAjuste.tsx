import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency } from '@/lib/masks';
import { AlertTriangle, Wallet, HandCoins, Loader2 } from 'lucide-react';
import { NotaFiscalPreview } from '@/components/solicitacoes/NotaFiscalPreview';

interface SolicitacaoAjuste {
  id: string;
  empresa_id: string;
  valor_entregue: number | null;
  valor_gasto_real: number | null;
  troco_real: number | null;
  solicitante_user_id: string;
  upload_nota_fiscal_url: string | null;
  empresas?: { nome_fantasia: string } | null;
  profiles?: { nome: string } | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solicitacao: SolicitacaoAjuste | null;
  onSuccess: () => void;
}

type TipoAjuste = 'complemento_fundo' | 'reembolso_usuario';

export function ModalResolverAjuste({ open, onOpenChange, solicitacao, onSuccess }: Props) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [tipo, setTipo] = useState<TipoAjuste>('complemento_fundo');
  const [observacao, setObservacao] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (!solicitacao) return null;

  const diferenca = Math.abs(solicitacao.troco_real || 0);
  const valorEntregue = solicitacao.valor_entregue || 0;
  const valorGasto = solicitacao.valor_gasto_real || 0;

  const reset = () => {
    setTipo('complemento_fundo');
    setObservacao('');
  };

  const handleClose = (next: boolean) => {
    if (!next) reset();
    onOpenChange(next);
  };

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const agora = new Date().toISOString();

      // 1. Atualizar solicitação
      const { error: updateError } = await supabase
        .from('solicitacoes')
        .update({
          status: 'baixada',
          tipo_ajuste: tipo,
          valor_ajuste: diferenca,
          data_ajuste: agora,
          admin_ajuste_id: user?.id,
          observacao_ajuste: observacao || null,
        })
        .eq('id', solicitacao.id);

      if (updateError) throw updateError;

      // 2. Se complemento do fundo: debitar o saldo + histórico
      if (tipo === 'complemento_fundo') {
        const { data: fundo } = await supabase
          .from('fundos')
          .select('id, saldo_atual')
          .eq('empresa_id', solicitacao.empresa_id)
          .maybeSingle();

        if (fundo) {
          const saldoAnterior = Number(fundo.saldo_atual);
          const novoSaldo = saldoAnterior - diferenca;

          const { error: fundoError } = await supabase
            .from('fundos')
            .update({ saldo_atual: novoSaldo })
            .eq('id', fundo.id);

          if (fundoError) throw fundoError;

          await supabase.from('historico_fundos').insert({
            fundo_id: fundo.id,
            solicitacao_id: solicitacao.id,
            tipo: 'ajuste',
            valor: -diferenca,
            saldo_anterior: saldoAnterior,
            saldo_posterior: novoSaldo,
            descricao: `Complemento do fundo - excedente da solicitação (${solicitacao.profiles?.nome || 'usuário'})`,
            admin_id: user?.id,
          });
        }
      } else {
        // Reembolso: registra apenas no histórico para auditoria, sem alterar saldo
        const { data: fundo } = await supabase
          .from('fundos')
          .select('id, saldo_atual')
          .eq('empresa_id', solicitacao.empresa_id)
          .maybeSingle();

        if (fundo) {
          const saldoAtual = Number(fundo.saldo_atual);
          await supabase.from('historico_fundos').insert({
            fundo_id: fundo.id,
            solicitacao_id: solicitacao.id,
            tipo: 'ajuste',
            valor: 0,
            saldo_anterior: saldoAtual,
            saldo_posterior: saldoAtual,
            descricao: `Reembolso ao usuário ${solicitacao.profiles?.nome || ''} - ${formatCurrency(diferenca)} pagos com recursos próprios`,
            admin_id: user?.id,
          });
        }
      }

      // 3. Notificar solicitante
      await supabase.from('notificacoes').insert({
        user_id: solicitacao.solicitante_user_id,
        titulo: 'Pendência de ajuste resolvida',
        mensagem:
          tipo === 'complemento_fundo'
            ? `O excedente de ${formatCurrency(diferenca)} foi registrado como complemento retirado do fundo fixo.`
            : `O excedente de ${formatCurrency(diferenca)} será reembolsado a você pela empresa.`,
        tipo: 'sucesso',
        link: `/solicitacao/${solicitacao.id}`,
      });

      toast({ title: 'Ajuste resolvido com sucesso!' });
      reset();
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const error = err as Error;
      toast({ title: 'Erro ao resolver ajuste', description: error.message, variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Resolver Pendência de Ajuste</DialogTitle>
          <DialogDescription>
            {solicitacao.empresas?.nome_fantasia} • Solicitante: {solicitacao.profiles?.nome || '-'}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-5">
            {/* Resumo financeiro */}
            <div className="grid grid-cols-3 gap-3">
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Valor Entregue</p>
                <p className="text-lg font-bold">{formatCurrency(valorEntregue)}</p>
              </div>
              <div className="p-3 rounded-lg bg-muted/50">
                <p className="text-xs text-muted-foreground">Valor Gasto</p>
                <p className="text-lg font-bold">{formatCurrency(valorGasto)}</p>
              </div>
              <div className="p-3 rounded-lg bg-warning/10 border border-warning/30">
                <p className="text-xs text-muted-foreground">Diferença</p>
                <p className="text-lg font-bold text-warning">{formatCurrency(diferenca)}</p>
              </div>
            </div>

            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                O usuário gastou <strong>{formatCurrency(diferenca)} a mais</strong> do que recebeu.
                Selecione abaixo a origem desse valor para fechar a baixa.
              </AlertDescription>
            </Alert>

            {/* Tipo de ajuste */}
            <div className="space-y-2">
              <Label>Origem do valor excedente *</Label>
              <RadioGroup value={tipo} onValueChange={(v) => setTipo(v as TipoAjuste)}>
                <label
                  htmlFor="complemento"
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    tipo === 'complemento_fundo' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <RadioGroupItem value="complemento_fundo" id="complemento" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <Wallet className="h-4 w-4" />
                      Complemento do fundo fixo
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      O usuário retirou esse valor adicional do próprio fundo fixo após a entrega.
                      O saldo da empresa será debitado em <strong>{formatCurrency(diferenca)}</strong>.
                    </p>
                  </div>
                </label>

                <label
                  htmlFor="reembolso"
                  className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors ${
                    tipo === 'reembolso_usuario' ? 'border-primary bg-primary/5' : 'border-border hover:bg-muted/30'
                  }`}
                >
                  <RadioGroupItem value="reembolso_usuario" id="reembolso" className="mt-1" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 font-medium">
                      <HandCoins className="h-4 w-4" />
                      Reembolso ao usuário
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      O usuário pagou com recursos próprios e deve ser reembolsado em{' '}
                      <strong>{formatCurrency(diferenca)}</strong>. O saldo do fundo não será alterado.
                    </p>
                  </div>
                </label>
              </RadioGroup>
            </div>

            {/* Observação */}
            <div className="space-y-2">
              <Label htmlFor="obs">Observação (opcional)</Label>
              <Textarea
                id="obs"
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                placeholder="Ex.: reembolso pago via PIX em 25/04/2026"
                rows={3}
              />
            </div>

            {/* Nota fiscal */}
            {solicitacao.upload_nota_fiscal_url && (
              <div className="space-y-2 pt-2 border-t">
                <Label>Nota Fiscal</Label>
                <NotaFiscalPreview filePath={solicitacao.upload_nota_fiscal_url} />
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)} disabled={submitting}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar resolução
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
