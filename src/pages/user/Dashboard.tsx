import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { formatCurrency, formatDate } from '@/lib/masks';
import { FileText, Clock, CheckCircle, AlertTriangle, PlusCircle, FileUp } from 'lucide-react';
import { ModalImportarNota } from '@/components/user/ModalImportarNota';

interface Solicitacao {
  id: string;
  valor_solicitado: number;
  status: 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';
  created_at: string;
  empresas: { nome_fantasia: string } | null;
}

interface Stats {
  total: number;
  pendentes: number;
  entregues: number;
  pendentesAjuste: number;
}

export default function UserDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({ total: 0, pendentes: 0, entregues: 0, pendentesAjuste: 0 });
  const [recentSolicitacoes, setRecentSolicitacoes] = useState<Solicitacao[]>([]);
  const [loading, setLoading] = useState(true);
  const [importModalOpen, setImportModalOpen] = useState(false);

  useEffect(() => {
    if (!user) return;

    const fetchData = async () => {
      const { data: solicitacoes } = await supabase
        .from('solicitacoes')
        .select('id, valor_solicitado, status, created_at, empresas(nome_fantasia)')
        .eq('solicitante_user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(5);

      if (solicitacoes) {
        setRecentSolicitacoes(solicitacoes as Solicitacao[]);
        
        const { count: total } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('solicitante_user_id', user.id);

        const { count: pendentes } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('solicitante_user_id', user.id)
          .eq('status', 'enviada');

        const { count: entregues } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('solicitante_user_id', user.id)
          .eq('status', 'entregue');

        const { count: pendentesAjuste } = await supabase
          .from('solicitacoes')
          .select('*', { count: 'exact', head: true })
          .eq('solicitante_user_id', user.id)
          .eq('status', 'pendente_ajuste');

        setStats({
          total: total || 0,
          pendentes: pendentes || 0,
          entregues: entregues || 0,
          pendentesAjuste: pendentesAjuste || 0,
        });
      }
      setLoading(false);
    };

    fetchData();
  }, [user]);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Meu Dashboard</h1>
            <p className="text-muted-foreground">Acompanhe suas solicitações de fundo fixo</p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setImportModalOpen(true)}>
              <FileUp className="mr-2 h-4 w-4" />
              Importar Nota
            </Button>
            <Button asChild>
              <Link to="/nova-solicitacao">
                <PlusCircle className="mr-2 h-4 w-4" />
                Nova Solicitação
              </Link>
            </Button>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Total de Solicitações"
            value={stats.total}
            icon={<FileText className="h-5 w-5" />}
            variant="default"
            onClick={() => navigate('/minhas-solicitacoes')}
          />
          <StatCard
            title="Aguardando Aprovação"
            value={stats.pendentes}
            icon={<Clock className="h-5 w-5" />}
            variant="primary"
            onClick={() => navigate('/minhas-solicitacoes?status=enviada')}
          />
          <StatCard
            title="Prontas para Baixa"
            value={stats.entregues}
            icon={<CheckCircle className="h-5 w-5" />}
            variant="success"
            onClick={() => navigate('/minhas-solicitacoes?status=entregue')}
          />
          <StatCard
            title="Pendentes de Ajuste"
            value={stats.pendentesAjuste}
            icon={<AlertTriangle className="h-5 w-5" />}
            variant="warning"
            onClick={() => navigate('/minhas-solicitacoes?status=pendente_ajuste')}
          />
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Solicitações Recentes</h2>
            <Button variant="ghost" asChild>
              <Link to="/minhas-solicitacoes">Ver todas</Link>
            </Button>
          </div>
          
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
          ) : recentSolicitacoes.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-muted-foreground mb-4">Você ainda não tem solicitações</p>
              <Button asChild>
                <Link to="/nova-solicitacao">Criar primeira solicitação</Link>
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Data</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Empresa</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Valor</th>
                    <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {recentSolicitacoes.map((sol) => (
                    <tr key={sol.id} className="border-b border-border hover:bg-muted/50">
                      <td className="py-3 px-2 text-sm">{formatDate(sol.created_at)}</td>
                      <td className="py-3 px-2 text-sm">{sol.empresas?.nome_fantasia || '-'}</td>
                      <td className="py-3 px-2 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                      <td className="py-3 px-2"><StatusBadge status={sol.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <ModalImportarNota open={importModalOpen} onOpenChange={setImportModalOpen} />
    </AppLayout>
  );
}
