import { useMemo } from "react";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
} from "recharts";
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

interface RelatorioPorUsuarioProps {
  solicitacoes: Tables<"solicitacoes">[];
  profiles: Tables<"profiles">[];
}

interface UsuarioStats {
  userId: string;
  nome: string;
  email: string;
  quantidade: number;
  valorTotal: number;
  ultimaSolicitacao: string | null;
}

export default function RelatorioPorUsuario({
  solicitacoes,
  profiles,
}: RelatorioPorUsuarioProps) {
  const usuariosStats = useMemo(() => {
    const stats: Record<string, UsuarioStats> = {};

    profiles.forEach((profile) => {
      stats[profile.user_id] = {
        userId: profile.user_id,
        nome: profile.nome,
        email: profile.email,
        quantidade: 0,
        valorTotal: 0,
        ultimaSolicitacao: null,
      };
    });

    solicitacoes.forEach((s) => {
      if (!stats[s.solicitante_user_id]) {
        stats[s.solicitante_user_id] = {
          userId: s.solicitante_user_id,
          nome: "Usuário não encontrado",
          email: "-",
          quantidade: 0,
          valorTotal: 0,
          ultimaSolicitacao: null,
        };
      }

      const stat = stats[s.solicitante_user_id];
      stat.quantidade += 1;
      stat.valorTotal += Number(s.valor_solicitado || 0);

      if (
        !stat.ultimaSolicitacao ||
        s.created_at > stat.ultimaSolicitacao
      ) {
        stat.ultimaSolicitacao = s.created_at;
      }
    });

    return Object.values(stats)
      .filter((u) => u.quantidade > 0)
      .sort((a, b) => b.valorTotal - a.valorTotal);
  }, [solicitacoes, profiles]);

  const top5Usuarios = useMemo(() => {
    return usuariosStats.slice(0, 5).map((u) => ({
      nome: u.nome.length > 12 ? u.nome.substring(0, 12) + "..." : u.nome,
      valor: u.valorTotal,
    }));
  }, [usuariosStats]);

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(value);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "-";
    return format(parseISO(dateStr), "dd/MM/yyyy", { locale: ptBR });
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Users Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-medium">
              Top 5 Usuários por Gasto
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={top5Usuarios} layout="vertical">
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
                  <Tooltip
                    formatter={(value: number) => [formatCurrency(value), "Valor"]}
                    contentStyle={{
                      backgroundColor: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "0.5rem",
                    }}
                  />
                  <Bar
                    dataKey="valor"
                    fill="hsl(142, 76%, 36%)"
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
              Resumo por Usuário
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Total de usuários ativos:</span>
                <span className="font-medium">{usuariosStats.length}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Média de solicitações por usuário:</span>
                <span className="font-medium">
                  {usuariosStats.length > 0
                    ? (
                        usuariosStats.reduce((acc, u) => acc + u.quantidade, 0) /
                        usuariosStats.length
                      ).toFixed(1)
                    : "0"}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Valor médio por usuário:</span>
                <span className="font-medium">
                  {formatCurrency(
                    usuariosStats.length > 0
                      ? usuariosStats.reduce((acc, u) => acc + u.valorTotal, 0) /
                          usuariosStats.length
                      : 0
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
            Ranking de Usuários
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">#</TableHead>
                  <TableHead>Nome</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Qtd. Solicitações</TableHead>
                  <TableHead className="text-right">Valor Total</TableHead>
                  <TableHead className="text-right">Última Solicitação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {usuariosStats.map((usuario, index) => (
                  <TableRow key={usuario.userId}>
                    <TableCell className="font-medium text-muted-foreground">
                      {index + 1}
                    </TableCell>
                    <TableCell className="font-medium">{usuario.nome}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {usuario.email}
                    </TableCell>
                    <TableCell className="text-right">{usuario.quantidade}</TableCell>
                    <TableCell className="text-right">
                      {formatCurrency(usuario.valorTotal)}
                    </TableCell>
                    <TableCell className="text-right text-muted-foreground">
                      {formatDate(usuario.ultimaSolicitacao)}
                    </TableCell>
                  </TableRow>
                ))}
                {usuariosStats.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                      Nenhum usuário com solicitações encontrado
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
