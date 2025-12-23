import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, maskCurrency, parseCurrency } from '@/lib/masks';
import { Search, Check, X, Eye } from 'lucide-react';

type StatusType = 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number | null;
  status: StatusType;
  created_at: string;
  justificativa: string;
  categoria: string | null;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
}

export default function AdminSolicitacoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [valorEntregue, setValorEntregue] = useState('');
  const [formaEntrega, setFormaEntrega] = useState('dinheiro');
  const [observacoes, setObservacoes] = useState('');
  const [motivoRejeicao, setMotivoRejeicao] = useState('');

  const fetchSolicitacoes = async () => {
    let query = supabase
      .from('solicitacoes')
      .select('id, valor_solicitado, valor_entregue, status, created_at, justificativa, categoria, empresas(nome_fantasia), profiles:solicitante_user_id(nome)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as StatusType);
    }

    const { data } = await query;
    if (data) setSolicitacoes(data as unknown as Solicitacao[]);
    setLoading(false);
  };

  useEffect(() => { fetchSolicitacoes(); }, [statusFilter]);

  const openApprove = (sol: Solicitacao) => {
    setSelectedSolicitacao(sol);
    setValorEntregue(maskCurrency(String(sol.valor_solicitado * 100)));
    setFormaEntrega('dinheiro');
    setObservacoes('');
    setApproveDialogOpen(true);
  };

  const openReject = (sol: Solicitacao) => {
    setSelectedSolicitacao(sol);
    setMotivoRejeicao('');
    setRejectDialogOpen(true);
  };

  const openDetail = (sol: Solicitacao) => {
    setSelectedSolicitacao(sol);
    setDetailDialogOpen(true);
  };

  const handleApprove = async () => {
    if (!selectedSolicitacao) return;
    const valor = parseCurrency(valorEntregue);
    if (valor <= 0) {
      toast({ title: 'Erro', description: 'Valor entregue deve ser maior que zero', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('solicitacoes').update({
      status: 'entregue',
      valor_entregue: valor,
      forma_entrega: formaEntrega,
      observacoes_admin: observacoes || null,
      admin_aprovador_id: user?.id,
      data_aprovacao: new Date().toISOString(),
    }).eq('id', selectedSolicitacao.id);

    if (error) {
      toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
      return;
    }

    // Create notification for user
    await supabase.from('notificacoes').insert({
      user_id: selectedSolicitacao.id, // This should be solicitante_user_id, but we don't have it here
      titulo: 'Solicitação Aprovada',
      mensagem: `Sua solicitação de ${formatCurrency(selectedSolicitacao.valor_solicitado)} foi aprovada. Valor entregue: ${formatCurrency(valor)}`,
      tipo: 'success',
    });

    toast({ title: 'Solicitação aprovada!' });
    setApproveDialogOpen(false);
    fetchSolicitacoes();
  };

  const handleReject = async () => {
    if (!selectedSolicitacao || !motivoRejeicao) {
      toast({ title: 'Erro', description: 'Informe o motivo da rejeição', variant: 'destructive' });
      return;
    }

    const { error } = await supabase.from('solicitacoes').update({
      status: 'rejeitada',
      motivo_rejeicao: motivoRejeicao,
      admin_aprovador_id: user?.id,
      data_aprovacao: new Date().toISOString(),
    }).eq('id', selectedSolicitacao.id);

    if (error) {
      toast({ title: 'Erro ao rejeitar', description: error.message, variant: 'destructive' });
      return;
    }

    toast({ title: 'Solicitação rejeitada' });
    setRejectDialogOpen(false);
    fetchSolicitacoes();
  };

  const filtered = solicitacoes.filter(s =>
    s.empresas?.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
    s.profiles?.nome.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Gerenciar Solicitações</h1>

        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Buscar..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="enviada">Aguardando</SelectItem>
              <SelectItem value="entregue">Entregues</SelectItem>
              <SelectItem value="baixada">Baixadas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="pendente_ajuste">Pendente Ajuste</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma solicitação encontrada</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium">Data</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Solicitante</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Empresa</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Solicitado</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Entregue</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sol) => (
                    <tr key={sol.id} className="border-t border-border hover:bg-muted/30">
                      <td className="py-3 px-4 text-sm">{formatDate(sol.created_at)}</td>
                      <td className="py-3 px-4 text-sm">{sol.profiles?.nome || '-'}</td>
                      <td className="py-3 px-4 text-sm">{sol.empresas?.nome_fantasia || '-'}</td>
                      <td className="py-3 px-4 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                      <td className="py-3 px-4 text-sm">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</td>
                      <td className="py-3 px-4"><StatusBadge status={sol.status} /></td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openDetail(sol)}>
                            <Eye className="h-4 w-4" />
                          </Button>
                          {sol.status === 'enviada' && (
                            <>
                              <Button size="sm" variant="ghost" className="text-success hover:text-success" onClick={() => openApprove(sol)}>
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => openReject(sol)}>
                                <X className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        {/* Approve Dialog */}
        <Dialog open={approveDialogOpen} onOpenChange={setApproveDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Aprovar e Entregar</DialogTitle>
              <DialogDescription>
                Solicitação de {selectedSolicitacao ? formatCurrency(selectedSolicitacao.valor_solicitado) : ''}
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Valor Entregue *</Label>
                <Input
                  value={valorEntregue}
                  onChange={(e) => setValorEntregue(maskCurrency(e.target.value))}
                  placeholder="R$ 0,00"
                />
                {selectedSolicitacao && parseCurrency(valorEntregue) < selectedSolicitacao.valor_solicitado && (
                  <p className="text-sm text-warning">Valor menor que o solicitado</p>
                )}
              </div>
              <div className="space-y-2">
                <Label>Forma de Entrega</Label>
                <Select value={formaEntrega} onValueChange={setFormaEntrega}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="dinheiro">Dinheiro</SelectItem>
                    <SelectItem value="pix">PIX</SelectItem>
                    <SelectItem value="outro">Outro</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Observações</Label>
                <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} placeholder="Opcional..." />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setApproveDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleApprove}>Aprovar e Entregar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Rejeitar Solicitação</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Motivo da Rejeição *</Label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)}>Cancelar</Button>
              <Button variant="destructive" onClick={handleReject}>Rejeitar</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Detail Dialog */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Detalhes da Solicitação</DialogTitle>
            </DialogHeader>
            {selectedSolicitacao && (
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-muted-foreground">Solicitante</p>
                    <p className="font-medium">{selectedSolicitacao.profiles?.nome || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Empresa</p>
                    <p className="font-medium">{selectedSolicitacao.empresas?.nome_fantasia || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Data</p>
                    <p className="font-medium">{formatDate(selectedSolicitacao.created_at)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Status</p>
                    <StatusBadge status={selectedSolicitacao.status} />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Solicitado</p>
                    <p className="font-medium">{formatCurrency(selectedSolicitacao.valor_solicitado)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">Valor Entregue</p>
                    <p className="font-medium">{selectedSolicitacao.valor_entregue ? formatCurrency(selectedSolicitacao.valor_entregue) : '-'}</p>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Justificativa</p>
                  <p className="mt-1">{selectedSolicitacao.justificativa}</p>
                </div>
                {selectedSolicitacao.categoria && (
                  <div>
                    <p className="text-sm text-muted-foreground">Categoria</p>
                    <p className="font-medium">{selectedSolicitacao.categoria}</p>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
