import { useState } from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { CalendarIcon, Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface FiltrosState {
  dataInicio: Date | undefined;
  dataFim: Date | undefined;
  empresaId: string;
  status: string;
}

interface FiltrosPeriodoProps {
  filtros: FiltrosState;
  onFiltrosChange: (filtros: FiltrosState) => void;
  empresas: Array<{ id: string; nome_fantasia: string }>;
}

const STATUS_OPTIONS = [
  { value: "todos", label: "Todos os status" },
  { value: "enviada", label: "Enviada" },
  { value: "aprovada", label: "Aprovada" },
  { value: "entregue", label: "Entregue" },
  { value: "rejeitada", label: "Rejeitada" },
  { value: "baixada", label: "Baixada" },
  { value: "pendente_ajuste", label: "Pendente Ajuste" },
];

export default function FiltrosPeriodo({
  filtros,
  onFiltrosChange,
  empresas,
}: FiltrosPeriodoProps) {
  const [tempFiltros, setTempFiltros] = useState<FiltrosState>(filtros);

  const handleAplicar = () => {
    onFiltrosChange(tempFiltros);
  };

  const handleLimpar = () => {
    const filtrosLimpos: FiltrosState = {
      dataInicio: undefined,
      dataFim: undefined,
      empresaId: "todas",
      status: "todos",
    };
    setTempFiltros(filtrosLimpos);
    onFiltrosChange(filtrosLimpos);
  };

  return (
    <div className="flex flex-col gap-4 p-4 bg-card rounded-lg border border-border">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Data Início
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !tempFiltros.dataInicio && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {tempFiltros.dataInicio ? (
                  format(tempFiltros.dataInicio, "dd/MM/yyyy", { locale: ptBR })
                ) : (
                  <span>Selecionar</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={tempFiltros.dataInicio}
                onSelect={(date) =>
                  setTempFiltros({ ...tempFiltros, dataInicio: date })
                }
                initialFocus
                className="p-3 pointer-events-auto"
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Data Fim
          </label>
          <Popover>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "w-full justify-start text-left font-normal",
                  !tempFiltros.dataFim && "text-muted-foreground"
                )}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {tempFiltros.dataFim ? (
                  format(tempFiltros.dataFim, "dd/MM/yyyy", { locale: ptBR })
                ) : (
                  <span>Selecionar</span>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={tempFiltros.dataFim}
                onSelect={(date) =>
                  setTempFiltros({ ...tempFiltros, dataFim: date })
                }
                initialFocus
                className="p-3 pointer-events-auto"
                locale={ptBR}
              />
            </PopoverContent>
          </Popover>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Empresa
          </label>
          <Select
            value={tempFiltros.empresaId}
            onValueChange={(value) =>
              setTempFiltros({ ...tempFiltros, empresaId: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todas as empresas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="todas">Todas as empresas</SelectItem>
              {empresas.map((empresa) => (
                <SelectItem key={empresa.id} value={empresa.id}>
                  {empresa.nome_fantasia}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-col gap-2">
          <label className="text-sm font-medium text-muted-foreground">
            Status
          </label>
          <Select
            value={tempFiltros.status}
            onValueChange={(value) =>
              setTempFiltros({ ...tempFiltros, status: value })
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Todos os status" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 sm:justify-end">
        <Button variant="outline" onClick={handleLimpar} className="w-full sm:w-auto">
          Limpar
        </Button>
        <Button onClick={handleAplicar} className="w-full sm:w-auto gap-2">
          <Filter className="h-4 w-4" />
          Aplicar Filtros
        </Button>
      </div>
    </div>
  );
}
