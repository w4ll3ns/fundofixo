import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/masks';
import { ArrowUpDown, Search, FileText, Eye, Download, AlertTriangle, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ModalBaixaAdmin } from '@/components/admin/ModalBaixaAdmin';
import { ModalExcluirBaixa } from '@/components/admin/ModalExcluirBaixa';
import { useIsMobile } from '@/hooks/use-mobile';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number;
  status: string;
  data_aprovacao: string;
  created_at: string;
  empresa_id: string;
  solicitante_user_id: string;
  tipo_solicitacao: 'FUNDO_FIXO' | 'COMPRA_AVULSA';
  upload_nota_fiscal_url: string | null;
  empresas: { nome_fantasia: string } | null;
  profiles: { nome: string } | null;
  justificativa: string;
}

interface Empresa {
  id: string;
  nome_fantasia: string;
}

type SortField = 'data_aprovacao' | 'valor_entregue' | 'empresas' | 'profiles';
type SortOrder = 'asc' | 'desc';

export default function BaixasPendentes() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Filters
  const [empresaFilter, setEmpresaFilter] = useState<string>('all');
  const [searchTerm, setSearchTerm] = useState('');
  
  // Sorting
  const [sortField, setSortField] = useState<SortField>('data_aprovacao');
  const [sortOrder, setSortOrder] = useState<SortOrder>('desc');
  
  // Modal
  const [selectedSolicitacao, setSelectedSolicitacao] = useState<Solicitacao | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [selectedToDelete, setSelectedToDelete] = useState<Solicitacao | null>(null);

  const fetchData = async () => {
    setLoading(true);
    const [solRes, empRes] = await Promise.all([
      supabase
        .from('solicitacoes')
        .select('id, valor_solicitado, valor_entregue, status, data_aprovacao, created_at, empresa_id, solicitante_user_id, tipo_solicitacao, upload_nota_fiscal_url, justificativa, empresas(nome_fantasia), profiles:solicitante_user_id(nome)')
        .eq('status', 'entregue')
        .order('data_aprovacao', { ascending: false }),
      supabase.from('empresas').select('id, nome_fantasia').eq('status', true),
    ]);

    setSolicitacoes((solRes.data as unknown as Solicitacao[]) || []);
    setEmpresas(empRes.data || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortOrder('asc');
    }
  };

  const getDaysPending = (dataAprovacao: string) => {
    const aprovacao = new Date(dataAprovacao);
    const hoje = new Date();
    const diff = Math.floor((hoje.getTime() - aprovacao.getTime()) / (1000 * 60 * 60 * 24));
    return diff;
  };

  const filteredAndSorted = solicitacoes
    .filter((sol) => {
      if (empresaFilter !== 'all' && sol.empresa_id !== empresaFilter) return false;
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const nome = sol.profiles?.nome?.toLowerCase() || '';
        const empresa = sol.empresas?.nome_fantasia?.toLowerCase() || '';
        if (!nome.includes(search) && !empresa.includes(search)) return false;
      }
      return true;
    })
    .sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'data_aprovacao':
          comparison = new Date(a.data_aprovacao).getTime() - new Date(b.data_aprovacao).getTime();
          break;
        case 'valor_entregue':
          comparison = (a.valor_entregue || 0) - (b.valor_entregue || 0);
          break;
        case 'empresas':
          comparison = (a.empresas?.nome_fantasia || '').localeCompare(b.empresas?.nome_fantasia || '');
          break;
        case 'profiles':
          comparison = (a.profiles?.nome || '').localeCompare(b.profiles?.nome || '');
          break;
      }
      return sortOrder === 'asc' ? comparison : -comparison;
    });

  const handleOpenBaixa = (sol: Solicitacao) => {
    setSelectedSolicitacao(sol);
    setModalOpen(true);
  };

  const handleBaixaSuccess = () => {
    setModalOpen(false);
    setSelectedSolicitacao(null);
    fetchData();
  };

  const handleOpenDelete = (sol: Solicitacao) => {
    setSelectedToDelete(sol);
    setDeleteModalOpen(true);
  };

  const handleDeleteSuccess = () => {
    setDeleteModalOpen(false);
    setSelectedToDelete(null);
    fetchData();
  };

  const SortHeader = ({ field, children }: { field: SortField; children: React.ReactNode }) => (
    <th 
      className="text-left py-3 px-2 text-sm font-medium text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
      onClick={() => handleSort(field)}
    >
      <div className="flex items-center gap-1">
        {children}
        <ArrowUpDown className={cn("h-3 w-3", sortField === field && "text-primary")} />
      </div>
    </th>
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Baixas Pendentes</h1>
            <p className="text-muted-foreground">Solicitações aguardando prestação de contas</p>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileText className="h-4 w-4" />
            <span>{filteredAndSorted.length} solicitações</span>
          </div>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por solicitante ou empresa..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Filtrar por empresa" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas as empresas</SelectItem>
                  {empresas.map((emp) => (
                    <SelectItem key={emp.id} value={emp.id}>{emp.nome_fantasia}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button 
                variant="outline" 
                onClick={() => { setEmpresaFilter('all'); setSearchTerm(''); }}
                className="sm:w-auto"
              >
                Limpar filtros
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : filteredAndSorted.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nenhuma baixa pendente encontrada
              </div>
            ) : isMobile ? (
              // Mobile: Cards
              <div className="divide-y divide-border -mx-6">
                {filteredAndSorted.map((sol) => {
                  const days = getDaysPending(sol.data_aprovacao);
                  const isLate = days > 7;
                  return (
                    <div key={sol.id} className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium truncate">{sol.empresas?.nome_fantasia || '-'}</p>
                          <p className="text-sm text-muted-foreground truncate">{sol.profiles?.nome || '-'}</p>
                        </div>
                        <div className={cn(
                          "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium shrink-0",
                          isLate ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                        )}>
                          {isLate && <AlertTriangle className="h-3 w-3" />}
                          {days}d
                        </div>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div>
                          <p className="text-muted-foreground">Solicitado</p>
                          <p className="font-medium">{formatCurrency(sol.valor_solicitado)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Entregue</p>
                          <p className="font-medium">{formatCurrency(sol.valor_entregue || 0)}</p>
                        </div>
                      </div>
                      
                      <div className="text-sm text-muted-foreground">
                        Aprovado em: {sol.data_aprovacao ? formatDate(sol.data_aprovacao) : '-'}
                      </div>
                      
                      <div className="flex gap-2 pt-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          className="flex-1 h-10"
                          onClick={() => navigate(`/solicitacao/${sol.id}`)}
                        >
                          <Eye className="h-4 w-4 mr-2" />
                          Ver
                        </Button>
                        <Button 
                          size="sm"
                          className="flex-1 h-10"
                          onClick={() => handleOpenBaixa(sol)}
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Baixa
                        </Button>
                        <Button 
                          variant="outline"
                          size="sm"
                          className="h-10 px-3 text-destructive hover:text-destructive hover:bg-destructive/10"
                          onClick={() => handleOpenDelete(sol)}
                          aria-label="Excluir baixa"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              // Desktop: Table
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <SortHeader field="data_aprovacao">Data Aprovação</SortHeader>
                      <SortHeader field="empresas">Empresa</SortHeader>
                      <SortHeader field="profiles">Solicitante</SortHeader>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Valor Solicitado</th>
                      <SortHeader field="valor_entregue">Valor Entregue</SortHeader>
                      <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Dias Pendente</th>
                      <th className="text-right py-3 px-2 text-sm font-medium text-muted-foreground">Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSorted.map((sol) => {
                      const days = getDaysPending(sol.data_aprovacao);
                      const isLate = days > 7;
                      return (
                        <tr key={sol.id} className="border-b border-border hover:bg-muted/50">
                          <td className="py-3 px-2 text-sm">
                            {sol.data_aprovacao ? formatDate(sol.data_aprovacao) : '-'}
                          </td>
                          <td className="py-3 px-2 text-sm">{sol.empresas?.nome_fantasia || '-'}</td>
                          <td className="py-3 px-2 text-sm">{sol.profiles?.nome || '-'}</td>
                          <td className="py-3 px-2 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                          <td className="py-3 px-2 text-sm font-medium">{formatCurrency(sol.valor_entregue || 0)}</td>
                          <td className="py-3 px-2">
                            <div className={cn(
                              "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                              isLate ? "bg-destructive/10 text-destructive" : "bg-muted text-muted-foreground"
                            )}>
                              {isLate && <AlertTriangle className="h-3 w-3" />}
                              {days} dias
                            </div>
                          </td>
                          <td className="py-3 px-2 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button 
                                variant="ghost" 
                                size="sm"
                                onClick={() => navigate(`/solicitacao/${sol.id}`)}
                              >
                                <Eye className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="default" 
                                size="sm"
                                onClick={() => handleOpenBaixa(sol)}
                              >
                                <Download className="h-4 w-4 mr-1" />
                                Baixa
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleOpenDelete(sol)}
                                aria-label="Excluir baixa"
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Baixa */}
      <ModalBaixaAdmin
        open={modalOpen}
        onOpenChange={setModalOpen}
        solicitacao={selectedSolicitacao}
        onSuccess={handleBaixaSuccess}
      />

      {/* Modal de Exclusão */}
      <ModalExcluirBaixa
        open={deleteModalOpen}
        onOpenChange={setDeleteModalOpen}
        solicitacao={selectedToDelete}
        onSuccess={handleDeleteSuccess}
      />
    </AppLayout>
  );
}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de Baixa */}
      <ModalBaixaAdmin
        open={modalOpen}
        onOpenChange={setModalOpen}
        solicitacao={selectedSolicitacao}
        onSuccess={handleBaixaSuccess}
      />
    </AppLayout>
  );
}
