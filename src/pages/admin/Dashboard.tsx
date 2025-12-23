import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { StatCard } from '@/components/ui/stat-card';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { supabase } from '@/integrations/supabase/client';
import { formatCurrency, formatDate } from '@/lib/masks';
import { Clock, Wallet, CheckCircle, ArrowDownRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({ aguardando: 0, saldoTotal: 0, aguardandoBaixa: 0, valorSaiu: 0 });
  const [recentSolicitacoes, setRecentSolicitacoes] = useState<any[]>([]);

  useEffect(() => {
    const fetchData = async () => {
      const [aguardandoRes, fundosRes, aguardandoBaixaRes, valorSaiuRes, solicitacoesRes] = await Promise.all([
        supabase.from('solicitacoes').select('*', { count: 'exact', head: true }).eq('status', 'enviada'),
        supabase.from('fundos').select('saldo_atual'),
        supabase.from('solicitacoes').select('*', { count: 'exact', head: true }).eq('status', 'entregue'),
        supabase.from('solicitacoes').select('valor_solicitado').eq('status', 'baixada'),
        supabase.from('solicitacoes')
          .select('id, valor_solicitado, status, created_at, empresas(nome_fantasia), profiles:solicitante_user_id(nome)')
          .order('created_at', { ascending: false })
          .limit(10),
      ]);

      const saldoTotal = (fundosRes.data || []).reduce((acc, f) => acc + Number(f.saldo_atual), 0);
      const valorSaiu = (valorSaiuRes.data || []).reduce((acc, s) => acc + Number(s.valor_solicitado), 0);

      setStats({ 
        aguardando: aguardandoRes.count || 0, 
        saldoTotal,
        aguardandoBaixa: aguardandoBaixaRes.count || 0,
        valorSaiu,
      });
      setRecentSolicitacoes(solicitacoesRes.data || []);
    };
    fetchData();
  }, []);

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <h1 className="text-2xl font-bold">Dashboard Administrativo</h1>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Saldo Disponível" value={formatCurrency(stats.saldoTotal)} icon={<Wallet className="h-5 w-5" />} variant="success" />
          <StatCard title="Valor que Saiu" value={formatCurrency(stats.valorSaiu)} icon={<ArrowDownRight className="h-5 w-5" />} variant="default" />
          <StatCard title="Aguardando Aprovação" value={stats.aguardando} icon={<Clock className="h-5 w-5" />} variant="primary" onClick={() => navigate('/admin/solicitacoes?status=enviada')} />
          <StatCard title="Aguardando Baixa" value={stats.aguardandoBaixa} icon={<CheckCircle className="h-5 w-5" />} variant="default" onClick={() => navigate('/admin/baixas-pendentes')} />
        </div>

        <Card className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Solicitações Recentes</h2>
            <Button variant="ghost" asChild><Link to="/admin/solicitacoes">Ver todas</Link></Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Data</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Solicitante</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Empresa</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Valor</th>
                  <th className="text-left py-3 px-2 text-sm font-medium text-muted-foreground">Status</th>
                </tr>
              </thead>
              <tbody>
                {recentSolicitacoes.map((sol) => (
                  <tr key={sol.id} className="border-b border-border hover:bg-muted/50">
                    <td className="py-3 px-2 text-sm">{formatDate(sol.created_at)}</td>
                    <td className="py-3 px-2 text-sm">{sol.profiles?.nome || '-'}</td>
                    <td className="py-3 px-2 text-sm">{sol.empresas?.nome_fantasia || '-'}</td>
                    <td className="py-3 px-2 text-sm font-medium">{formatCurrency(sol.valor_solicitado)}</td>
                    <td className="py-3 px-2"><StatusBadge status={sol.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </AppLayout>
  );
}
