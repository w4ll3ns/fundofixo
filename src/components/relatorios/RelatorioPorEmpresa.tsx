import { useMemo } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { Tables } from "@/integrations/supabase/types";

interface RelatorioPorEmpresaProps {
  solicitacoes: Tables<"solicitacoes">[];
  empresas: Tables<"empresas">[];
  fundos: Tables<"fundos">[];
}

interface EmpresaStats {
  id: string;
  nome: string;
  quantidade: number;
  valorTotal: number;
  saldoAtual: number;
  percentual: number;
}

export default function RelatorioPorEmpresa({
  solicitacoes,
  empresas,
  fundos,
}: RelatorioPorEmpresaProps) {
  const empresasStats = useMemo(() => {
    const valorTotalGeral = solicitacoes.reduce(
      (acc, s) => acc + Number(s.valor_solicitado || 0),
      0
    );

    const stats: Record<string, EmpresaStats> = {};

    empresas.forEach((empresa) => {
      const fundo = fundos.find((f) => f.empresa_id === empresa.id);
      stats[empresa.id] = {
        id: empresa.id,
        nome: empresa.nome_fantasia,
        quantidade: 0,
        valorTotal: 0,
        saldoAtual: Number(fundo?.saldo_atual || 0),
        percentual: 0,
      };
    });

    solicitacoes.forEach((s) => {
      if (stats[s.empresa_id]) {
        stats[s.empresa_id].quantidade += 1;
        stats[s.empresa_id].valorTotal += Number(s.valor_solicitado || 0);
      }
    });

    // Calculate percentage
    Object.values(stats).forEach((stat) => {
      stat.percentual =
        valorTotalGeral > 0 ? (stat.valorTotal / valorTotalGeral) * 100 : 0;
    });

    return Object.values(stats).sort((a, b) => b.valorTotal - a.valorTotal);
  }, [solicitacoes, empresas, fundos]);

  const top5Empresas = useMemo(() => {
    return empresasStats.slice(0, 5).map((e) => ({
      nome: e.nome.length > 15 ? e.nome.substring(0, 15) + "..." : e.nome,
      valor: e.valorTotal,
    }));
  }, [empresasStats]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Top 5 Empresas por Gasto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Empresas} layout="vertical">
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                    horizontal={true}
                    vertical={false}
                  />
                  <XAxis
                    type="number"
                    tickFormatter={(value) =>
                      new Intl.NumberFormat("pt-BR", {
                        notation: "compact",
                        compactDisplay: "short",
                      }).format(value)
                    }
                    tick={{ fontSize: 12 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    tick={{ fontSize: 12 }}
                    width={100}
                    className="text-muted-foreground"
                  />
                  <ChartTooltip
                    content={
                      <ChartTooltipContent
                        formatter={(value) => [formatCurrency(Number(value)), "Valor"]}
                      />
                    }
                  />
                  <Bar
                    dataKey="valor"
                    fill="hsl(217, 91%, 50%)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Summary Stats */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Resumo por Empresa
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total de empresas ativas:</span>
                <span className="font-medium">{empresas.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Empresas com solicitações:</span>
                <span className="font-medium">
                  {empresasStats.filter((e) => e.quantidade > 0).length}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Saldo total disponível:</span>
                <span className="font-medium text-success">
                  {formatCurrency(
                    fundos.reduce((acc, f) => acc + Number(f.saldo_atual || 0), 0)
                  )}
                </span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Full Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-medium">
            Ranking de Empresas
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Empresa</TableHead>
                  <TableHead className="text-right">Qtd. Solicitações</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Saldo Atual</TableHead>
                  <TableHead className="text-right">% do Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {empresasStats.map((empresa, index) => (
                  <TableRow key={empresa.id}>
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{empresa.nome}</TableCell>
                    <TableCell className="text-right">{empresa.quantidade}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(empresa.valorTotal)}
                    </TableCell>
                    <TableCell className="text-right text-success">
                      {formatCurrency(empresa.saldoAtual)}
                    </TableCell>
                    <TableCell className="text-right">
                      {empresa.percentual.toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
                {empresasStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhuma empresa encontrada
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
