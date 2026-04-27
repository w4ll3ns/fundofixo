import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency } from '@/lib/masks';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NotasFiscaisManager, NotaFiscalItem } from '@/components/baixa/NotasFiscaisManager';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number;
  status: string;
  empresa_id: string;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
  justificativa: string;
}

interface ModalBaixaAdminProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  solicitacao: Solicitacao | null;
  onSuccess: () => void;
}

export function ModalBaixaAdmin({ open, onOpenChange, solicitacao, onSuccess }: ModalBaixaAdminProps) {
  const { toast } = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [adminId, setAdminId] = useState<string | null>(null);
  const [notas, setNotas] = useState<NotaFiscalItem[]>([]);

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data: { user } }) => setAdminId(user?.id || null));
  }, [open]);

  const reset = () => setNotas([]);

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) reset();
    onOpenChange(isOpen);
  };

  const valorGasto = notas.reduce((s, n) => s + Number(n.valor || 0), 0);
  const trocoReal = solicitacao ? (solicitacao.valor_entregue || 0) - valorGasto : 0;

  const handleSubmit = async () => {
    if (!solicitacao || notas.length === 0) return;
    setSubmitting(true);

    const newStatus = trocoReal < 0 ? 'pendente_ajuste' : 'baixada';
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
      created_by: adminId,
    }));
    const { error: insertErr } = await supabase.from('solicitacao_notas').insert(rows);
    if (insertErr) {
      toast({ title: 'Erro ao salvar notas', description: insertErr.message, variant: 'destructive' });
      setSubmitting(false);
      return;
    }

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
          descricao: `Troco devolvido pelo admin - solicitação de ${solicitacao.profiles?.nome}`,
          admin_id: adminId,
        });
      }
    }

    toast({ title: 'Baixa realizada com sucesso!' });
    setSubmitting(false);
    reset();
    onSuccess();
  };

  if (!solicitacao) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Realizar Baixa</DialogTitle>
          <DialogDescription>
            {solicitacao.profiles?.nome} • {solicitacao.empresas?.nome_fantasia} • Valor entregue: {formatCurrency(solicitacao.valor_entregue || 0)}
          </DialogDescription>
        </DialogHeader>

        <DialogBody>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Anexe uma ou mais notas fiscais. O valor total será a soma de todas as notas.
            </p>
            <NotasFiscaisManager
              notas={notas}
              onChange={setNotas}
              storagePathPrefix={`admin/${adminId}/${solicitacao.id}`}
              inputIdPrefix="admin-baixa"
            />

            {notas.length > 0 && (
              <div className={cn(
                'p-3 rounded-lg',
                trocoReal > 0 ? 'bg-success/10' : trocoReal < 0 ? 'bg-warning/10' : 'bg-muted'
              )}>
                <div className="grid gap-2 grid-cols-3 text-center text-sm">
                  <div>
                    <p className="text-xs text-muted-foreground">Entregue</p>
                    <p className="font-medium">{formatCurrency(solicitacao.valor_entregue || 0)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Total Gasto</p>
                    <p className="font-medium">{formatCurrency(valorGasto)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">{trocoReal >= 0 ? 'Troco' : 'Diferença'}</p>
                    <p className={cn('font-bold', trocoReal > 0 ? 'text-success' : trocoReal < 0 ? 'text-warning' : '')}>
                      {formatCurrency(Math.abs(trocoReal))}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={notas.length === 0 || valorGasto <= 0 || submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            Confirmar Baixa
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
