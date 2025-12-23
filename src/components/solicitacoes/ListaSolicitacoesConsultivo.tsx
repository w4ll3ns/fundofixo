import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatusBadge } from '@/components/ui/status-badge';
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
  solicitante_user_id: string;
  empresa_id: string;
}

interface Empresa {
  id: string;
  nome_fantasia: string;
}

interface Profile {
  user_id: string;
  nome: string;
}

interface ListaSolicitacoesConsultivoProps {
  solicitacoes: Solicitacao[];
  empresas: Empresa[];
  profiles: Profile[];
  loading?: boolean;
}

export function ListaSolicitacoesConsultivo({
  solicitacoes,
  empresas,
  profiles,
  loading = false,
}: ListaSolicitacoesConsultivoProps) {
  const isMobile = useIsMobile();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [empresaFilter, setEmpresaFilter] = useState<string>('todas');
  const [search, setSearch] = useState('');

  const getEmpresaNome = (empresaId: string) => {
    return empresas.find(e => e.id === empresaId)?.nome_fantasia || 'N/A';
  };

  const getSolicitanteNome = (userId: string) => {
    return profiles.find(p => p.user_id === userId)?.nome || 'N/A';
  };

  const filtered = solicitacoes.filter(s => {
    // Status filter
    if (statusFilter !== 'all' && s.status !== statusFilter) return false;
    // Empresa filter
    if (empresaFilter !== 'todas' && s.empresa_id !== empresaFilter) return false;
    // Search filter
    const empresaNome = getEmpresaNome(s.empresa_id).toLowerCase();
    const solicitanteNome = getSolicitanteNome(s.solicitante_user_id).toLowerCase();
    const searchLower = search.toLowerCase();
    if (search && !empresaNome.includes(searchLower) && 
        !solicitanteNome.includes(searchLower) && 
        !s.justificativa.toLowerCase().includes(searchLower)) {
      return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por empresa, solicitante ou justificativa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <Select value={empresaFilter} onValueChange={setEmpresaFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Empresa" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="todas">Todas Empresas</SelectItem>
            {empresas.map(empresa => (
              <SelectItem key={empresa.id} value={empresa.id}>
                {empresa.nome_fantasia}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-full sm:w-48">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos Status</SelectItem>
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
                    <p className="font-medium truncate">{getEmpresaNome(sol.empresa_id)}</p>
                    <p className="text-sm text-muted-foreground">{getSolicitanteNome(sol.solicitante_user_id)}</p>
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
                
                <Button size="sm" variant="outline" className="w-full h-10" asChild>
                  <Link to={`/solicitacao/${sol.id}`}>
                    <Eye className="h-4 w-4 mr-2" />
                    Ver Detalhes
                  </Link>
                </Button>
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
                    <td className="py-3 px-4 text-sm">{getSolicitanteNome(sol.solicitante_user_id)}</td>
                    <td className="py-3 px-4 text-sm">{getEmpresaNome(sol.empresa_id)}</td>
                    <td className="py-3 px-4 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                    <td className="py-3 px-4 text-sm">{sol.valor_entregue ? formatCurrency(sol.valor_entregue) : '-'}</td>
                    <td className="py-3 px-4"><StatusBadge status={sol.status} /></td>
                    <td className="py-3 px-4">
                      <Button size="sm" variant="ghost" asChild>
                        <Link to={`/solicitacao/${sol.id}`}><Eye className="h-4 w-4" /></Link>
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <p className="text-sm text-muted-foreground">
        {filtered.length} solicitações encontradas
      </p>
    </div>
  );
}
