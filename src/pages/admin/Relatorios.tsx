import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, BarChart3 } from "lucide-react";
import { format, parseISO, isAfter, isBefore, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { AppLayout } from "@/components/layout/AppLayout";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import FiltrosPeriodo, { FiltrosState } from "@/components/relatorios/FiltrosPeriodo";
import ResumoGeral from "@/components/relatorios/ResumoGeral";
import RelatorioPorEmpresa from "@/components/relatorios/RelatorioPorEmpresa";
import RelatorioPorUsuario from "@/components/relatorios/RelatorioPorUsuario";

export default function Relatorios() {
  const [activeTab, setActiveTab] = useState("geral");
  const [filtros, setFiltros] = useState<FiltrosState>({
    dataInicio: undefined,
    dataFim: undefined,
    empresaId: "todas",
    status: "todos",
  });

  // Fetch solicitacoes
  const { data: solicitacoes = [], isLoading: loadingSolicitacoes } = useQuery({
    queryKey: ["relatorios-solicitacoes"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("solicitacoes")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return data;
    },
  });

  // Fetch empresas
  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ["relatorios-empresas"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("empresas")
        .select("*")
        .eq("status", true)
        .order("nome_fantasia");

      if (error) throw error;
      return data;
    },
  });

  // Fetch fundos
  const { data: fundos = [], isLoading: loadingFundos } = useQuery({
    queryKey: ["relatorios-fundos"],
    queryFn: async () => {
      const { data, error } = await supabase.from("fundos").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Fetch profiles
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ["relatorios-profiles"],
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("*");
      if (error) throw error;
      return data;
    },
  });

  // Apply filters
  const filteredSolicitacoes = useMemo(() => {
    return solicitacoes.filter((s) => {
      // Filter by date range
      if (filtros.dataInicio) {
        const dataInicio = startOfDay(filtros.dataInicio);
        const createdAt = parseISO(s.created_at);
        if (isBefore(createdAt, dataInicio)) return false;
      }
      if (filtros.dataFim) {
        const dataFim = endOfDay(filtros.dataFim);
        const createdAt = parseISO(s.created_at);
        if (isAfter(createdAt, dataFim)) return false;
      }

      // Filter by empresa
      if (filtros.empresaId !== "todas" && s.empresa_id !== filtros.empresaId) {
        return false;
      }

      // Filter by status
      if (filtros.status !== "todos" && s.status !== filtros.status) {
        return false;
      }

      return true;
    });
  }, [solicitacoes, filtros]);

  // Export to CSV
  const handleExportCSV = () => {
    const headers = [
      "ID",
      "Data",
      "Solicitante",
      "Empresa",
      "Valor Solicitado",
      "Status",
      "Tipo",
      "Justificativa",
    ];

    const rows = filteredSolicitacoes.map((s) => {
      const profile = profiles.find((p) => p.user_id === s.solicitante_user_id);
      const empresa = empresas.find((e) => e.id === s.empresa_id);

      return [
        s.id,
        format(parseISO(s.created_at), "dd/MM/yyyy HH:mm", { locale: ptBR }),
        profile?.nome || "N/A",
        empresa?.nome_fantasia || "N/A",
        s.valor_solicitado.toString().replace(".", ","),
        s.status,
        s.tipo_solicitacao,
        `"${s.justificativa.replace(/"/g, '""')}"`,
      ];
    });

    const csvContent = [
      headers.join(";"),
      ...rows.map((row) => row.join(";")),
    ].join("\n");

    const blob = new Blob(["\ufeff" + csvContent], {
      type: "text/csv;charset=utf-8;",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-solicitacoes-${format(new Date(), "yyyy-MM-dd")}.csv`;
    link.click();
  };

  const isLoading =
    loadingSolicitacoes || loadingEmpresas || loadingFundos || loadingProfiles;

  return (
    <AppLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 rounded-lg">
              <BarChart3 className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-foreground">Relatórios</h1>
              <p className="text-sm text-muted-foreground">
                Análise de solicitações e movimentações
              </p>
            </div>
          </div>

          <Button onClick={handleExportCSV} className="gap-2">
            <Download className="h-4 w-4" />
            Exportar CSV
          </Button>
        </div>

        {/* Filters */}
        <FiltrosPeriodo
          filtros={filtros}
          onFiltrosChange={setFiltros}
          empresas={empresas}
        />

        {/* Results Info */}
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <FileSpreadsheet className="h-4 w-4" />
          <span>
            {filteredSolicitacoes.length} solicitações encontradas
            {filtros.dataInicio || filtros.dataFim || filtros.empresaId !== "todas" || filtros.status !== "todos"
              ? " (filtrado)"
              : ""}
          </span>
        </div>

        {/* Tabs */}
        {isLoading ? (
          <div className="space-y-4">
            <Skeleton className="h-10 w-[400px]" />
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {[...Array(4)].map((_, i) => (
                <Skeleton key={i} className="h-32" />
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Skeleton className="h-[350px]" />
              <Skeleton className="h-[350px]" />
            </div>
          </div>
        ) : (
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-3 lg:w-[400px]">
              <TabsTrigger value="geral">Visão Geral</TabsTrigger>
              <TabsTrigger value="empresa">Por Empresa</TabsTrigger>
              <TabsTrigger value="usuario">Por Usuário</TabsTrigger>
            </TabsList>

            <TabsContent value="geral" className="mt-6">
              <ResumoGeral solicitacoes={filteredSolicitacoes} />
            </TabsContent>

            <TabsContent value="empresa" className="mt-6">
              <RelatorioPorEmpresa
                solicitacoes={filteredSolicitacoes}
                empresas={empresas}
                fundos={fundos}
              />
            </TabsContent>

            <TabsContent value="usuario" className="mt-6">
              <RelatorioPorUsuario
                solicitacoes={filteredSolicitacoes}
                profiles={profiles}
              />
            </TabsContent>
          </Tabs>
        )}
      </div>
    </AppLayout>
  );
}
