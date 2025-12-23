import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/masks';
import { Search, Eye } from 'lucide-react';

type StatusType = 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  valor_entregue: number | null;
  status: StatusType;
  created_at: string;
  justificativa: string;
  empresas: { nome_fantasia: string } | null;
}

export default function MinhasSolicitacoes() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [solicitacoes, setSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<string>(searchParams.get('status') || 'all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!user) return;

    const fetchSolicitacoes = async () => {
      let query = supabase
        .from('solicitacoes')
        .select('id, valor_solicitado, valor_entregue, status, created_at, justificativa, empresas(nome_fantasia)')
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

  const filtered = solicitacoes.filter(s => 
    s.empresas?.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
    s.justificativa.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Minhas Solicitações</h1>

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
          <Select value={statusFilter} onValueChange={(value) => {
            setStatusFilter(value);
            if (value === 'all') {
              setSearchParams({});
            } else {
              setSearchParams({ status: value });
            }
          }}>
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
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium">Data</th>
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
                      <td className="py-3 px-4 text-sm">{sol.empresas?.nome_fantasia}</td>
                      <td className="py-3 px-4 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                      <td className="py-3 px-4 text-sm">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</td>
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
    </AppLayout>
  );
}
