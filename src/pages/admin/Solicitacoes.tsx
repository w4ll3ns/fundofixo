import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription, DialogBody } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge } from '@/components/ui/status-badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate, maskCurrency, parseCurrency } from '@/lib/masks';
import { LIMITE_MAXIMO_SOLICITACAO, TIPOS_SOLICITACAO_LABELS, TipoSolicitacao } from '@/lib/constants';
import { Search, Check, X, Eye, AlertTriangle, Wallet } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type StatusType = 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number | null;
  status: StatusType;
  created_at: string;
  justificativa: string;
  categoria: string | null;
  tipo_solicitacao: TipoSolicitacao;
  excedeu_saldo: boolean;
  excedeu_limite_maximo: boolean;
  empresa_id: string;
  solicitante_user_id: string;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
  nome_emitente: string | null;
  cnpj_emitente: string | null;
  upload_nota_fiscal_url: string | null;
  data_emissao_nota: string | null;
}

interface Fundo {
  id: string;
  empresa_id: string;
  saldo_atual: number;
}

export default function AdminSolicitacoes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [mesCompetencia, setMesCompetencia] = useState<string>('all');
  const [search, setSearch] = useState('');
  
  const [approveDialogOpen, setApproveDialogOpen] = useState(false);
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false);
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [valorEntregue, setValorEntregue] = useState('');
  const [formaEntrega, setFormaEntrega] = useState('dinheiro');
  const [observacoes, setObservacoes] = useState('');
  const [motivoRejeicao, setMotivoRejeicao] = useState('');
  const [autorizarExcesso, setAutorizarExcesso] = useState(false);
  const [justificativaExcesso, setJustificativaExcesso] = useState('');

  const fetchData = async () => {
    let query = supabase
      .from('solicitacoes')
      .select('id, valor_solicitado, valor_entregue, status, created_at, justificativa, categoria, tipo_solicitacao, excedeu_saldo, excedeu_limite_maximo, empresa_id, solicitante_user_id, nome_emitente, cnpj_emitente, upload_nota_fiscal_url, data_emissao_nota, empresas(nome_fantasia), profiles:solicitante_user_id(nome)')
      .order('created_at', { ascending: false });

    if (statusFilter !== 'all') {
      query = query.eq('status', statusFilter as StatusType);
    }

    const [solicitacoesRes, fundosRes] = await Promise.all([
      query,
      supabase.from('fundos').select('id, empresa_id, saldo_atual'),
    ]);

    if (solicitacoesRes.data) setSolicitacoes(solicitacoesRes.data as unknown as Solicitacao[]);
    if (fundosRes.data) setFundos(fundosRes.data);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [statusFilter]);

  const getSaldoEmpresa = (empresaId: string) => {
    return fundos.find(f => f.empresa_id === empresaId)?.saldo_atual || 0;
  };

  const getFundoId = (empresaId: string) => {
    return fundos.find(f => f.empresa_id === empresaId)?.id;
  };

  const openApprove = (sol: Solicitacao) => {
    setSelectedSolicitacao(sol);
    setValorEntregue(maskCurrency(String(sol.valor_solicitado * 100)));
    setFormaEntrega('dinheiro');
    setObservacoes('');
    setAutorizarExcesso(false);
    setJustificativaExcesso('');
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

    const saldoAtual = getSaldoEmpresa(selectedSolicitacao.empresa_id);
    const fundoId = getFundoId(selectedSolicitacao.empresa_id);
    const isFundoFixo = selectedSolicitacao.tipo_solicitacao === 'FUNDO_FIXO';
    const excedeValor = valor > LIMITE_MAXIMO_SOLICITACAO;
    const excedeSaldo = isFundoFixo && valor > saldoAtual;

    // Check if authorization is needed
    if ((excedeValor || excedeSaldo) && !autorizarExcesso) {
      toast({ 
        title: 'Autorização necessária', 
        description: 'Marque a opção para autorizar o excesso e forneça uma justificativa.', 
        variant: 'destructive' 
      });
      return;
    }

    if ((excedeValor || excedeSaldo) && autorizarExcesso && !justificativaExcesso.trim()) {
      toast({ 
        title: 'Justificativa necessária', 
        description: 'Forneça uma justificativa para autorizar o excesso.', 
        variant: 'destructive' 
      });
      return;
    }

    try {
      // Update solicitação
      const { error: updateError } = await supabase.from('solicitacoes').update({
        status: 'entregue',
        valor_entregue: valor,
        forma_entrega: formaEntrega,
        observacoes_admin: observacoes || null,
        admin_aprovador_id: user?.id,
        data_aprovacao: new Date().toISOString(),
        excedeu_saldo: excedeSaldo,
        excedeu_limite_maximo: excedeValor,
        justificativa_excesso_admin: (excedeValor || excedeSaldo) ? justificativaExcesso : null,
      }).eq('id', selectedSolicitacao.id);

      if (updateError) throw updateError;

      // If FUNDO_FIXO, update saldo and create history
      if (isFundoFixo && fundoId) {
        const novoSaldo = saldoAtual - valor;

        // Update fundo saldo
        const { error: fundoError } = await supabase
          .from('fundos')
          .update({ saldo_atual: novoSaldo })
          .eq('id', fundoId);

        if (fundoError) throw fundoError;

        // Create history record
        await supabase.from('historico_fundos').insert({
          fundo_id: fundoId,
          tipo: 'saida',
          valor: valor,
          descricao: `Entrega solicitação - ${selectedSolicitacao.justificativa.substring(0, 50)}...`,
          admin_id: user?.id,
          solicitacao_id: selectedSolicitacao.id,
          saldo_anterior: saldoAtual,
          saldo_posterior: novoSaldo,
        });
      }

      // Create notification for user
      await supabase.from('notificacoes').insert({
        user_id: selectedSolicitacao.solicitante_user_id,
        titulo: 'Solicitação Aprovada',
        mensagem: `Sua solicitação de ${formatCurrency(selectedSolicitacao.valor_solicitado)} foi aprovada. Valor entregue: ${formatCurrency(valor)}`,
        tipo: 'success',
      });

      toast({ title: 'Solicitação aprovada!' });
      setApproveDialogOpen(false);
      fetchData();
    } catch (error: any) {
      toast({ title: 'Erro ao aprovar', description: error.message, variant: 'destructive' });
    }
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

    // Create notification
    await supabase.from('notificacoes').insert({
      user_id: selectedSolicitacao.solicitante_user_id,
      titulo: 'Solicitação Rejeitada',
      mensagem: `Sua solicitação de ${formatCurrency(selectedSolicitacao.valor_solicitado)} foi rejeitada. Motivo: ${motivoRejeicao}`,
      tipo: 'error',
    });

    toast({ title: 'Solicitação rejeitada' });
    setRejectDialogOpen(false);
    fetchData();
  };

  // Gerar lista de meses disponíveis baseado nas notas baixadas
  const mesesDisponiveis = Array.from(
    new Set(
      solicitacoes
        .filter(s => s.data_emissao_nota && s.status === 'baixada')
        .map(s => {
          const date = new Date(s.data_emissao_nota!);
          return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        })
    )
  ).sort().reverse();

  const filtered = solicitacoes.filter(s => {
    const matchesSearch = s.empresas?.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
      s.profiles?.nome.toLowerCase().includes(search.toLowerCase());
    
    // Filtro por mês de competência
    if (mesCompetencia !== 'all' && s.data_emissao_nota) {
      const date = new Date(s.data_emissao_nota);
      const mesAno = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
      if (mesAno !== mesCompetencia) return false;
    } else if (mesCompetencia !== 'all' && !s.data_emissao_nota) {
      return false;
    }
    
    return matchesSearch;
  });

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
              <SelectItem value="all">Todos os status</SelectItem>
              <SelectItem value="enviada">Aguardando</SelectItem>
              <SelectItem value="entregue">Entregues</SelectItem>
              <SelectItem value="baixada">Baixadas</SelectItem>
              <SelectItem value="rejeitada">Rejeitadas</SelectItem>
              <SelectItem value="pendente_ajuste">Pendente Ajuste</SelectItem>
            </SelectContent>
          </Select>
          <Select value={mesCompetencia} onValueChange={setMesCompetencia}>
            <SelectTrigger className="w-full sm:w-48">
              <SelectValue placeholder="Mês Competência" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os meses</SelectItem>
              {mesesDisponiveis.map((mes) => {
                const [ano, mesNum] = mes.split('-');
                const meses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
                return (
                  <SelectItem key={mes} value={mes}>
                    {meses[parseInt(mesNum) - 1]}/{ano}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">Nenhuma solicitação encontrada</div>
          ) : isMobile ? (
            // Mobile: Cards
            <div className="divide-y divide-border">
              {filtered.map((sol) => (
                <div key={sol.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{sol.profiles?.nome || '-'}</p>
                      <p className="text-sm text-muted-foreground truncate">{sol.empresas?.nome_fantasia || '-'}</p>
                    </div>
                    <StatusBadge status={sol.status} />
                  </div>
                  
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge variant={sol.tipo_solicitacao === 'FUNDO_FIXO' ? 'default' : 'secondary'} className="text-xs">
                      {TIPOS_SOLICITACAO_LABELS[sol.tipo_solicitacao] || sol.tipo_solicitacao}
                    </Badge>
                    {sol.excedeu_saldo && (
                      <Badge variant="outline" className="text-warning border-warning text-xs">
                        <Wallet className="h-3 w-3 mr-1" /> Saldo
                      </Badge>
                    )}
                    {sol.excedeu_limite_maximo && (
                      <Badge variant="outline" className="text-destructive border-destructive text-xs">
                        <AlertTriangle className="h-3 w-3 mr-1" /> R$300
                      </Badge>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-muted-foreground">Solicitado</p>
                      <p className="font-medium">{formatCurrency(sol.valor_solicitado)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Entregue</p>
                      <p className="font-medium">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</p>
                    </div>
                  </div>
                  
                  <div className="text-xs text-muted-foreground">
                    {formatDate(sol.created_at)}
                    {sol.data_emissao_nota && ` • Nota: ${formatDate(sol.data_emissao_nota)}`}
                  </div>
                  
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 h-10"
                      onClick={() => openDetail(sol)}
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      Ver
                    </Button>
                    {sol.status === 'enviada' && (
                      <>
                        <Button 
                          size="sm" 
                          variant="default"
                          className="h-10 px-4"
                          onClick={() => openApprove(sol)}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive"
                          className="h-10 px-4"
                          onClick={() => openReject(sol)}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Desktop: Table
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium">Data</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Tipo</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Solicitante</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Empresa</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Solicitado</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Entregue</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Data Nota</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Alertas</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((sol) => (
                    <tr key={sol.id} className="border-t border-border hover:bg-muted/30">
                      <td className="py-3 px-4 text-sm">{formatDate(sol.created_at)}</td>
                      <td className="py-3 px-4 text-sm">
                        <Badge variant={sol.tipo_solicitacao === 'FUNDO_FIXO' ? 'default' : 'secondary'}>
                          {TIPOS_SOLICITACAO_LABELS[sol.tipo_solicitacao] || sol.tipo_solicitacao}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm">{sol.profiles?.nome || '-'}</td>
                      <td className="py-3 px-4 text-sm">{sol.empresas?.nome_fantasia || '-'}</td>
                      <td className="py-3 px-4 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                      <td className="py-3 px-4 text-sm">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</td>
                      <td className="py-3 px-4 text-sm">{sol.data_emissao_nota ? formatDate(sol.data_emissao_nota) : '-'}</td>
                      <td className="py-3 px-4"><StatusBadge status={sol.status} /></td>
                      <td className="py-3 px-4">
                        <div className="flex gap-1">
                          {sol.excedeu_saldo && (
                            <Badge variant="outline" className="text-warning border-warning text-xs">
                              <Wallet className="h-3 w-3 mr-1" /> Saldo
                            </Badge>
                          )}
                          {sol.excedeu_limite_maximo && (
                            <Badge variant="outline" className="text-destructive border-destructive text-xs">
                              <AlertTriangle className="h-3 w-3 mr-1" /> R$300
                            </Badge>
                          )}
                        </div>
                      </td>
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
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Aprovar e Entregar</DialogTitle>
              <DialogDescription>
                Solicitação de {selectedSolicitacao ? formatCurrency(selectedSolicitacao.valor_solicitado) : ''} 
                {selectedSolicitacao && ` - ${TIPOS_SOLICITACAO_LABELS[selectedSolicitacao.tipo_solicitacao]}`}
              </DialogDescription>
            </DialogHeader>
            
            {selectedSolicitacao && (
              <DialogBody>
                <div className="space-y-4">
                  {/* Info sobre saldo (apenas FUNDO_FIXO) */}
                  {selectedSolicitacao.tipo_solicitacao === 'FUNDO_FIXO' && (
                    <Alert>
                      <Wallet className="h-4 w-4" />
                      <AlertDescription>
                        Saldo disponível da empresa: <strong>{formatCurrency(getSaldoEmpresa(selectedSolicitacao.empresa_id))}</strong>
                      </AlertDescription>
                    </Alert>
                  )}

                  <div className="space-y-2">
                    <Label>Valor Entregue *</Label>
                    <Input
                      value={valorEntregue}
                      onChange={(e) => setValorEntregue(maskCurrency(e.target.value))}
                      placeholder="R$ 0,00"
                    />
                    {parseCurrency(valorEntregue) < selectedSolicitacao.valor_solicitado && (
                      <p className="text-sm text-warning">Valor menor que o solicitado</p>
                    )}
                    {parseCurrency(valorEntregue) > LIMITE_MAXIMO_SOLICITACAO && (
                      <p className="text-sm text-destructive flex items-center gap-1">
                        <AlertTriangle className="h-4 w-4" />
                        Excede limite máximo de {formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}
                      </p>
                    )}
                    {selectedSolicitacao.tipo_solicitacao === 'FUNDO_FIXO' && 
                     parseCurrency(valorEntregue) > getSaldoEmpresa(selectedSolicitacao.empresa_id) && (
                      <p className="text-sm text-warning flex items-center gap-1">
                        <Wallet className="h-4 w-4" />
                        Excede saldo disponível do fundo
                      </p>
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

                  {/* Autorização de excesso */}
                  {(parseCurrency(valorEntregue) > LIMITE_MAXIMO_SOLICITACAO || 
                    (selectedSolicitacao.tipo_solicitacao === 'FUNDO_FIXO' && 
                     parseCurrency(valorEntregue) > getSaldoEmpresa(selectedSolicitacao.empresa_id))) && (
                    <div className="space-y-4 p-4 rounded-lg border border-warning bg-warning/5">
                      <div className="flex items-center space-x-2">
                        <Checkbox 
                          id="autorizar" 
                          checked={autorizarExcesso}
                          onCheckedChange={(checked) => setAutorizarExcesso(!!checked)}
                        />
                        <Label htmlFor="autorizar" className="text-warning font-medium cursor-pointer">
                          Autorizo exceder o limite/saldo
                        </Label>
                      </div>
                      {autorizarExcesso && (
                        <div className="space-y-2">
                          <Label>Justificativa da Autorização *</Label>
                          <Textarea 
                            value={justificativaExcesso} 
                            onChange={(e) => setJustificativaExcesso(e.target.value)}
                            placeholder="Explique o motivo da autorização..."
                          />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </DialogBody>
            )}
            
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
            <DialogBody>
              <div className="space-y-2">
                <Label>Motivo da Rejeição *</Label>
                <Textarea
                  value={motivoRejeicao}
                  onChange={(e) => setMotivoRejeicao(e.target.value)}
                  placeholder="Informe o motivo..."
                  rows={4}
                />
              </div>
            </DialogBody>
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
              <DialogBody>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-sm text-muted-foreground">Tipo</p>
                      <Badge variant={selectedSolicitacao.tipo_solicitacao === 'FUNDO_FIXO' ? 'default' : 'secondary'}>
                        {TIPOS_SOLICITACAO_LABELS[selectedSolicitacao.tipo_solicitacao]}
                      </Badge>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Status</p>
                      <StatusBadge status={selectedSolicitacao.status} />
                    </div>
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
                      <p className="text-sm text-muted-foreground">Categoria</p>
                      <p className="font-medium">{selectedSolicitacao.categoria || '-'}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Solicitado</p>
                      <p className="font-medium">{formatCurrency(selectedSolicitacao.valor_solicitado)}</p>
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">Valor Entregue</p>
                      <p className="font-medium">{selectedSolicitacao.valor_entregue ? formatCurrency(selectedSolicitacao.valor_entregue) : '-'}</p>
                    </div>
                    {selectedSolicitacao.data_emissao_nota && (
                      <div>
                        <p className="text-sm text-muted-foreground">Data Emissão Nota</p>
                        <p className="font-medium">{formatDate(selectedSolicitacao.data_emissao_nota)}</p>
                      </div>
                    )}
                  </div>

                  {/* Alertas */}
                  {(selectedSolicitacao.excedeu_saldo || selectedSolicitacao.excedeu_limite_maximo) && (
                    <div className="flex gap-2 flex-wrap">
                      {selectedSolicitacao.excedeu_saldo && (
                        <Badge variant="outline" className="text-warning border-warning">
                          Excedeu saldo do fundo
                        </Badge>
                      )}
                      {selectedSolicitacao.excedeu_limite_maximo && (
                        <Badge variant="outline" className="text-destructive border-destructive">
                          Excedeu limite R$ 300
                        </Badge>
                      )}
                    </div>
                  )}

                  <div>
                    <p className="text-sm text-muted-foreground">Justificativa</p>
                    <p className="mt-1">{selectedSolicitacao.justificativa}</p>
                  </div>

                  {/* Dados do Fornecedor */}
                  {(selectedSolicitacao.nome_emitente || selectedSolicitacao.cnpj_emitente) && (
                    <div className="pt-4 border-t border-border">
                      <p className="text-sm font-medium mb-3">Dados do Fornecedor</p>
                      <div className="grid grid-cols-2 gap-4">
                        {selectedSolicitacao.nome_emitente && (
                          <div className="col-span-2">
                            <p className="text-sm text-muted-foreground">Nome/Razão Social</p>
                            <p className="font-medium">{selectedSolicitacao.nome_emitente}</p>
                          </div>
                        )}
                        {selectedSolicitacao.cnpj_emitente && (
                          <div>
                            <p className="text-sm text-muted-foreground">CNPJ</p>
                            <p className="font-medium font-mono">
                              {selectedSolicitacao.cnpj_emitente.replace(
                                /^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/,
                                '$1.$2.$3/$4-$5'
                              )}
                            </p>
                          </div>
                        )}
                        {selectedSolicitacao.upload_nota_fiscal_url && (
                          <div>
                            <p className="text-sm text-muted-foreground">Nota Fiscal</p>
                            <Badge variant="outline" className="text-success border-success">
                              Anexada
                            </Badge>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </DialogBody>
            )}
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
