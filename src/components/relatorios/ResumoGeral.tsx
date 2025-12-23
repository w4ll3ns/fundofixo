import { useMemo } from "react";
import { format, parseISO, startOfMonth } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  FileText,
  DollarSign,
  TrendingUp,
  CheckCircle,
} from "lucide-react";
import { StatCard } from "@/components/ui/stat-card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Tables } from "@/integrations/supabase/types";

interface ResumoGeralProps {
  solicitacoes: Tables<"solicitacoes">[];
}

const STATUS_COLORS: Record<string, string> = {
  enviada: "hsl(217, 91%, 50%)",
  aprovada: "hsl(142, 76%, 36%)",
  entregue: "hsl(38, 92%, 50%)",
  rejeitada: "hsl(0, 72%, 51%)",
  baixada: "hsl(215, 15%, 45%)",
  pendente_ajuste: "hsl(280, 65%, 60%)",
};

const STATUS_LABELS: Record<string, string> = {
  enviada: "Enviada",
  aprovada: "Aprovada",
  entregue: "Entregue",
  rejeitada: "Rejeitada",
  baixada: "Baixada",
  pendente_ajuste: "Pendente",
};

export default function ResumoGeral({ solicitacoes }: ResumoGeralProps) {
  const kpis = useMemo(() => {
    const total = solicitacoes.length;
    const valorTotal = solicitacoes.reduce(
      (acc, s) => acc + Number(s.valor_solicitado || 0),
      0
    );
    const media = total > 0 ? valorTotal / total : 0;
    const aprovadas = solicitacoes.filter(
      (s) => s.status === "aprovada" || s.status === "entregue" || s.status === "baixada"
    ).length;
    const taxaAprovacao = total > 0 ? (aprovadas / total) * 100 : 0;

    return {
      total,
      valorTotal,
      media,
      taxaAprovacao,
    };
  }, [solicitacoes]);

  const statusData = useMemo(() => {
    const counts: Record<string, number> = {};
    solicitacoes.forEach((s) => {
      counts[s.status] = (counts[s.status] || 0) + 1;
    });
    return Object.entries(counts).map(([status, count]) => ({
      name: STATUS_LABELS[status] || status,
      value: count,
      color: STATUS_COLORS[status] || "hsl(215, 15%, 45%)",
    }));
  }, [solicitacoes]);

  const evolucaoMensal = useMemo(() => {
    const meses: Record<string, number> = {};
    solicitacoes.forEach((s) => {
      const mes = format(startOfMonth(parseISO(s.created_at)), "yyyy-MM");
      meses[mes] = (meses[mes] || 0) + Number(s.valor_solicitado || 0);
    });
    return Object.entries(meses)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-12)
      .map(([mes, valor]) => ({
        mes: format(parseISO(`${mes}-01`), "MMM/yy", { locale: ptBR }),
        valor,
      }));
  }, [solicitacoes]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total de Solicitações"
          value={kpis.total.toString()}
          icon={<FileText className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Valor Total Movimentado"
          value={formatCurrency(kpis.valorTotal)}
          icon={<DollarSign className="h-5 w-5" />}
          variant="primary"
        />
        <StatCard
          title="Média por Solicitação"
          value={formatCurrency(kpis.media)}
          icon={<TrendingUp className="h-5 w-5" />}
          variant="default"
        />
        <StatCard
          title="Taxa de Aprovação"
          value={`${kpis.taxaAprovacao.toFixed(1)}%`}
          icon={<CheckCircle className="h-5 w-5" />}
          variant="success"
        />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Status Distribution Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Distribuição por Status
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} (${(percent * 100).toFixed(0)}%)`
                    }
                    labelLine={false}
                  >
                    {statusData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [`${value} solicitações`, ""]}
                      />
                    }
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Monthly Evolution Line Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Evolução Mensal de Gastos
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucaoMensal}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="mes"
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tickFormatter={(value) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        compactDisplay: "short",
                      }).format(value)
                    }
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [formatCurrency(Number(value)), "Valor"]}
                      />
                    }
                  />
                  <Line
                    type="monotone"
                    dataKey="valor"
                    stroke="hsl(217, 91%, 50%)"
                    strokeWidth={2}
                    dot={{ fill: "hsl(217, 91%, 50%)", r: 4 }}
                    activeDot={{ r: 6 }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
