import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDateTime, maskCurrency, parseCurrency } from '@/lib/masks';
import { Plus, History, Wallet, AlertTriangle, ArrowUp, ArrowDown } from 'lucide-react';

interface Empresa {
  id: string;
  nome_fantasia: string;
  unidade: string | null;
}

interface Fundo {
  id: string;
  empresa_id: string;
  saldo_atual: number;
  saldo_minimo_alerta: number | null;
  empresas: Empresa | null;
}

interface HistoricoItem {
  id: string;
  tipo: string;
  valor: number;
  descricao: string | null;
  saldo_anterior: number;
  saldo_posterior: number;
  created_at: string;
}

export default function GestaoSaldo() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedFundo, setSelectedFundo] = useState<Fundo | null>(null);
  const [historico, setHistorico] = useState<HistoricoItem[]>([]);
  
  const [addForm, setAddForm] = useState({
    empresa_id: '',
    valor: '',
    observacao: '',
  });

  const fetchData = async () => {
    setLoading(true);
    
    // Fetch fundos with empresa info
    const { data: fundosData } = await supabase
      .from('fundos')
      .select('*, empresas(id, nome_fantasia, unidade)')
      .order('saldo_atual', { ascending: false });
    
    // Fetch all active empresas
    const { data: empresasData } = await supabase
      .from('empresas')
      .select('id, nome_fantasia, unidade')
      .eq('status', true)
      .order('nome_fantasia');
    
    if (fundosData) setFundos(fundosData as unknown as Fundo[]);
    if (empresasData) setEmpresas(empresasData);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const openAddDialog = () => {
    setAddForm({ empresa_id: '', valor: '', observacao: '' });
    setAddDialogOpen(true);
  };

  const openHistoryDialog = async (fundo: Fundo) => {
    setSelectedFundo(fundo);
    
    const { data } = await supabase
      .from('historico_fundos')
      .select('*')
      .eq('fundo_id', fundo.id)
      .order('created_at', { ascending: false })
      .limit(50);
    
    setHistorico((data || []) as HistoricoItem[]);
    setHistoryDialogOpen(true);
  };

  const handleAddSaldo = async () => {
    const valor = parseCurrency(addForm.valor);
    if (!addForm.empresa_id || valor <= 0) {
      toast({ title: 'Erro', description: 'Selecione a empresa e informe um valor válido', variant: 'destructive' });
      return;
    }

    // Check if fundo exists for this empresa
    let fundo = fundos.find(f => f.empresa_id === addForm.empresa_id);
    let fundoId = fundo?.id;
    let saldoAnterior = fundo?.saldo_atual || 0;

    if (!fundo) {
      // Create new fundo
      const { data: newFundo, error: createError } = await supabase
        .from('fundos')
        .insert({ empresa_id: addForm.empresa_id, saldo_atual: 0 })
        .select()
        .single();
      
      if (createError) {
        toast({ title: 'Erro ao criar fundo', description: createError.message, variant: 'destructive' });
        return;
      }
      fundoId = newFundo.id;
      saldoAnterior = 0;
    }

    const novoSaldo = saldoAnterior + valor;

    // Update saldo
    const { error: updateError } = await supabase
      .from('fundos')
      .update({ saldo_atual: novoSaldo })
      .eq('id', fundoId);

    if (updateError) {
      toast({ title: 'Erro ao atualizar saldo', description: updateError.message, variant: 'destructive' });
      return;
    }

    // Create history record
    const { error: historyError } = await supabase
      .from('historico_fundos')
      .insert({
        fundo_id: fundoId,
        tipo: 'entrada',
        valor: valor,
        descricao: addForm.observacao || 'Aporte de saldo',
        admin_id: user?.id,
        saldo_anterior: saldoAnterior,
        saldo_posterior: novoSaldo,
      });

    if (historyError) {
      console.error('Error creating history:', historyError);
    }

    toast({ title: 'Saldo adicionado!', description: `${formatCurrency(valor)} adicionado com sucesso.` });
    setAddDialogOpen(false);
    fetchData();
  };

  const totalSaldo = fundos.reduce((acc, f) => acc + Number(f.saldo_atual), 0);
  const fundosComAlertas = fundos.filter(f => 
    f.saldo_minimo_alerta && Number(f.saldo_atual) < Number(f.saldo_minimo_alerta)
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Gestão de Saldo</h1>
            <p className="text-muted-foreground">Gerencie os fundos fixos das empresas</p>
          </div>
          <Button onClick={openAddDialog}>
            <Plus className="mr-2 h-4 w-4" />
            Adicionar Saldo
          </Button>
        </div>

        {/* Summary Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Saldo Total Disponível</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-primary" />
                <span className="text-2xl font-bold">{formatCurrency(totalSaldo)}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">Empresas com Fundo</CardTitle>
            </CardHeader>
            <CardContent>
              <span className="text-2xl font-bold">{fundos.length}</span>
            </CardContent>
          </Card>

          {fundosComAlertas.length > 0 && (
            <Card className="border-warning">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-warning flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4" />
                  Alertas de Saldo Baixo
                </CardTitle>
              </CardHeader>
              <CardContent>
                <span className="text-2xl font-bold text-warning">{fundosComAlertas.length}</span>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Fundos List */}
        <Card>
          <CardHeader>
            <CardTitle>Saldo por Empresa</CardTitle>
            <CardDescription>Visualize e gerencie o saldo de cada empresa</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8 text-muted-foreground">Carregando...</div>
            ) : fundos.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-muted-foreground mb-4">Nenhum fundo cadastrado</p>
                <Button onClick={openAddDialog}>Adicionar primeiro saldo</Button>
              </div>
            ) : (
              <div className="space-y-3">
                {fundos.map((fundo) => {
                  const isLowBalance = fundo.saldo_minimo_alerta && 
                    Number(fundo.saldo_atual) < Number(fundo.saldo_minimo_alerta);
                  
                  return (
                    <div 
                      key={fundo.id} 
                      className={`flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 rounded-lg border ${
                        isLowBalance ? 'border-warning bg-warning/5' : 'border-border'
                      }`}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="flex-shrink-0">
                          <Wallet className={`h-6 w-6 sm:h-8 sm:w-8 ${isLowBalance ? 'text-warning' : 'text-primary'}`} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">
                            {fundo.empresas?.nome_fantasia}
                            {fundo.empresas?.unidade && ` - ${fundo.empresas.unidade}`}
                          </p>
                          {isLowBalance && (
                            <p className="text-xs text-warning">⚠ Saldo abaixo do mínimo</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-3 sm:gap-4">
                        <div className="text-left sm:text-right">
                          <p className={`text-lg sm:text-xl font-bold ${isLowBalance ? 'text-warning' : ''}`}>
                            {formatCurrency(fundo.saldo_atual)}
                          </p>
                          {fundo.saldo_minimo_alerta && (
                            <p className="text-xs text-muted-foreground">
                              Mín: {formatCurrency(fundo.saldo_minimo_alerta)}
                            </p>
                          )}
                        </div>
                        <Button variant="ghost" size="sm" onClick={() => openHistoryDialog(fundo)}>
                          <History className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add Saldo Dialog */}
        <Dialog open={addDialogOpen} onOpenChange={setAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Adicionar Saldo ao Fundo Fixo</DialogTitle>
              <DialogDescription>
                Insira dinheiro no fundo fixo de uma empresa
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Empresa *</Label>
                <Select
                  value={addForm.empresa_id}
                  onValueChange={(value) => setAddForm({ ...addForm, empresa_id: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a empresa" />
                  </SelectTrigger>
                  <SelectContent>
                    {empresas.map((empresa) => (
                      <SelectItem key={empresa.id} value={empresa.id}>
                        {empresa.nome_fantasia}
                        {empresa.unidade && ` - ${empresa.unidade}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Valor a Adicionar *</Label>
                <Input
                  value={addForm.valor}
                  onChange={(e) => setAddForm({ ...addForm, valor: maskCurrency(e.target.value) })}
                  placeholder="R$ 0,00"
                />
              </div>
              <div className="space-y-2">
                <Label>Observação</Label>
                <Textarea
                  value={addForm.observacao}
                  onChange={(e) => setAddForm({ ...addForm, observacao: e.target.value })}
                  placeholder="Ex: Reposição mensal, aporte extra..."
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleAddSaldo}>Adicionar Saldo</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* History Dialog */}
        <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Histórico de Movimentações</DialogTitle>
              <DialogDescription>
                {selectedFundo?.empresas?.nome_fantasia}
                {selectedFundo?.empresas?.unidade && ` - ${selectedFundo.empresas.unidade}`}
              </DialogDescription>
            </DialogHeader>
            <div className="max-h-96 overflow-y-auto">
              {historico.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  Nenhuma movimentação registrada
                </div>
              ) : (
                <div className="space-y-3">
                  {historico.map((item) => (
                    <div 
                      key={item.id} 
                      className="flex items-start gap-3 p-3 rounded-lg border border-border"
                    >
                      <div className={`p-2 rounded-full ${
                        item.tipo === 'entrada' ? 'bg-success/10' : 'bg-destructive/10'
                      }`}>
                        {item.tipo === 'entrada' ? (
                          <ArrowUp className="h-4 w-4 text-success" />
                        ) : (
                          <ArrowDown className="h-4 w-4 text-destructive" />
                        )}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium">
                            {item.tipo === 'entrada' ? '+' : '-'} {formatCurrency(item.valor)}
                          </p>
                          <Badge variant={item.tipo === 'entrada' ? 'default' : 'secondary'}>
                            {item.tipo === 'entrada' ? 'Entrada' : 'Saída'}
                          </Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{item.descricao || '-'}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {formatDateTime(item.created_at)} • 
                          Saldo: {formatCurrency(item.saldo_anterior)} → {formatCurrency(item.saldo_posterior)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
