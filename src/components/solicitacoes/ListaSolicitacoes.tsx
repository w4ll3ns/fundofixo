import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/masks';
import { Search, Eye } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';

type StatusType = 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number | null;
  status: StatusType;
  created_at: string;
  justificativa: string;
  data_emissao_nota: string | null;
  empresas: { nome_fantasia: string } | null;
}

interface ListaSolicitacoesProps {
  defaultStatusFilter?: string;
}

export function ListaSolicitacoes({ defaultStatusFilter }: ListaSolicitacoesProps) {
  const { user } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(defaultStatusFilter || searchParams.get('status') || 'all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchSolicitacoes = async () => {
      let query = supabase
        .from('solicitacoes')
        .select('id, valor_solicitado, valor_entregue, status, created_at, justificativa, data_emissao_nota, empresas(nome_fantasia)')
        .eq('solicitante_user_id', user.id)
        .order('created_at', { ascending: false });

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter as StatusType);
      }

      const { data } = await query;
      if (data) setSolicitacoes(data as Solicitacao[]);
      setLoading(false);
    };

    fetchSolicitacoes();
  }, [user, statusFilter]);

  const handleStatusChange = (value: string) => {
    setStatusFilter(value);
    const params = new URLSearchParams(searchParams);
    if (value === 'all') {
      params.delete('status');
    } else {
      params.set('status', value);
    }
    // Preserve the tab parameter
    params.set('tab', 'lista');
    setSearchParams(params);
  };

  const filtered = solicitacoes.filter(s => 
    s.empresas?.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
    s.justificativa.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={statusFilter} onValueChange={handleStatusChange}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="enviada">Enviadas</SelectItem>
            <SelectItem value="aprovada">Aprovadas</SelectItem>
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
        ) : isMobile ? (
          // Mobile: Cards
          <div className="divide-y divide-border">
            {filtered.map((sol) => (
              <div key={sol.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium truncate">{sol.empresas?.nome_fantasia}</p>
                    <p className="text-xs text-muted-foreground">{formatDate(sol.created_at)}</p>
                  </div>
                  <StatusBadge status={sol.status} />
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
                
                {sol.data_emissao_nota && (
                  <div className="text-sm text-muted-foreground">
                    Nota: {formatDate(sol.data_emissao_nota)}
                  </div>
                )}
                
                <div className="flex gap-2 pt-2">
                  {(sol.status === 'entregue' || sol.status === 'pendente_ajuste') && (
                    <Button size="sm" className="flex-1 h-10" asChild>
                      <Link to={`/baixa/${sol.id}`}>Fazer Baixa</Link>
                    </Button>
                  )}
                  <Button size="sm" variant="outline" className="flex-1 h-10" asChild>
                    <Link to={`/solicitacao/${sol.id}`}>
                      <Eye className="h-4 w-4 mr-2" />
                      Ver Detalhes
                    </Link>
                  </Button>
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
                  <th className="text-left py-3 px-4 text-sm font-medium">Empresa</th>
                  <th className="text-left py-3 px-4 text-sm font-medium">Solicitado</th>
                  <th className="text-left py-3 px-4 text-sm font-medium">Entregue</th>
                  <th className="text-left py-3 px-4 text-sm font-medium">Data Nota</th>
                  <th className="text-left py-3 px-4 text-sm font-medium">Status</th>
                  <th className="text-left py-3 px-4 text-sm font-medium">Ações</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((sol) => (
                  <tr key={sol.id} className="border-t border-border hover:bg-muted/30">
                    <td className="py-3 px-4 text-sm">{formatDate(sol.created_at)}</td>
                    <td className="py-3 px-4 text-sm">{sol.empresas?.nome_fantasia}</td>
                    <td className="py-3 px-4 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                    <td className="py-3 px-4 text-sm">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</td>
                    <td className="py-3 px-4 text-sm">{sol.data_emissao_nota ? formatDate(sol.data_emissao_nota) : '-'}</td>
                    <td className="py-3 px-4"><StatusBadge status={sol.status} /></td>
                    <td className="py-3 px-4">
                      <div className="flex gap-2">
                        {(sol.status === 'entregue' || sol.status === 'pendente_ajuste') && (
                          <Button size="sm" asChild>
                            <Link to={`/baixa/${sol.id}`}>Fazer Baixa</Link>
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" asChild>
                          <Link to={`/solicitacao/${sol.id}`}><Eye className="h-4 w-4" /></Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
