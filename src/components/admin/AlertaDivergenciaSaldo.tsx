import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogBody } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { AlertTriangle, Wrench, Loader2 } from 'lucide-react';
import { useAuditoriaSaldos, DivergenciaSaldo } from '@/hooks/useAuditoriaSaldos';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { formatCurrency, formatDateTime } from '@/lib/masks';

export function AlertaDivergenciaSaldo() {
  const { divergencias, loading, recarregar } = useAuditoriaSaldos();
  const { user } = useAuth();
  const { toast } = useToast();
  const [selecionado, setSelecionado] = useState<DivergenciaSaldo | null>(null);
  const [motivo, setMotivo] = useState('');
  const [salvando, setSalvando] = useState(false);

  if (loading || divergencias.length === 0) return null;

  const abrirCorrecao = (d: DivergenciaSaldo) => {
    setSelecionado(d);
    setMotivo('');
  };

  const corrigir = async () => {
    if (!selecionado) return;
    if (motivo.trim().length < 5) {
      toast({ title: 'Motivo obrigatório', description: 'Descreva o motivo da reconciliação (mín. 5 caracteres).', variant: 'destructive' });
      return;
    }
    setSalvando(true);
    const { saldo_atual, saldo_esperado, diferenca, fundo_id } = selecionado;

    const { error: updErr } = await supabase
      .from('fundos')
      .update({ saldo_atual: saldo_esperado })
      .eq('id', fundo_id);

    if (updErr) {
      toast({ title: 'Erro ao atualizar saldo', description: updErr.message, variant: 'destructive' });
      setSalvando(false);
      return;
    }

    const { error: histErr } = await supabase.from('historico_fundos').insert({
      fundo_id,
      tipo: 'ajuste',
      valor: diferenca,
      descricao: `Reconciliação automática: ${motivo.trim()}`,
      admin_id: user?.id,
      saldo_anterior: saldo_atual,
      saldo_posterior: saldo_esperado,
    });

    if (histErr) {
      toast({ title: 'Saldo ajustado, mas falha ao registrar histórico', description: histErr.message, variant: 'destructive' });
    } else {
      toast({ title: 'Saldo reconciliado', description: `${selecionado.empresa_nome} agora está consistente.` });
    }

    setSelecionado(null);
    setSalvando(false);
    recarregar();
  };

  return (
    <>
      <Card className="border-destructive bg-destructive/5">
        <CardHeader>
          <CardTitle className="text-destructive flex items-center gap-2">
            <AlertTriangle className="h-5 w-5" />
            Divergência de saldo detectada
          </CardTitle>
          <CardDescription>
            O saldo atual de {divergencias.length} fundo(s) não confere com o histórico de movimentações.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {divergencias.map((d) => (
            <div
              key={d.fundo_id}
              className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-3 rounded-lg border border-destructive/30 bg-background"
            >
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{d.empresa_nome}</p>
                <p className="text-xs text-muted-foreground">
                  Atual: <span className="font-medium">{formatCurrency(d.saldo_atual)}</span> ·
                  {' '}Esperado: <span className="font-medium">{formatCurrency(d.saldo_esperado)}</span>
                </p>
                {d.ultima_movimentacao_em && (
                  <p className="text-xs text-muted-foreground">
                    Última movimentação: {formatDateTime(d.ultima_movimentacao_em)}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-3">
                <span className={`font-bold ${d.diferenca > 0 ? 'text-success' : 'text-destructive'}`}>
                  {d.diferenca > 0 ? '+' : ''}{formatCurrency(d.diferenca)}
                </span>
                <Button size="sm" variant="outline" onClick={() => abrirCorrecao(d)}>
                  <Wrench className="h-4 w-4 mr-2" />
                  Corrigir
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Dialog open={!!selecionado} onOpenChange={(o) => !o && setSelecionado(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reconciliar saldo</DialogTitle>
            <DialogDescription>
              {selecionado?.empresa_nome}
            </DialogDescription>
          </DialogHeader>
          <DialogBody>
            <div className="space-y-3">
              <div className="rounded-lg border p-3 text-sm space-y-1">
                <div className="flex justify-between"><span>Saldo atual:</span><span className="font-medium">{selecionado && formatCurrency(selecionado.saldo_atual)}</span></div>
                <div className="flex justify-between"><span>Saldo esperado:</span><span className="font-medium">{selecionado && formatCurrency(selecionado.saldo_esperado)}</span></div>
                <div className="flex justify-between border-t pt-1">
                  <span>Ajuste a aplicar:</span>
                  <span className={`font-bold ${selecionado && selecionado.diferenca > 0 ? 'text-success' : 'text-destructive'}`}>
                    {selecionado && (selecionado.diferenca > 0 ? '+' : '')}{selecionado && formatCurrency(selecionado.diferenca)}
                  </span>
                </div>
              </div>
              <div className="space-y-2">
                <Label>Motivo da reconciliação *</Label>
                <Textarea
                  value={motivo}
                  onChange={(e) => setMotivo(e.target.value)}
                  placeholder="Ex.: correção de duplicidade de estorno gerada por retentativa de exclusão"
                  rows={3}
                />
              </div>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelecionado(null)} disabled={salvando}>Cancelar</Button>
            <Button onClick={corrigir} disabled={salvando}>
              {salvando && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Aplicar reconciliação
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
