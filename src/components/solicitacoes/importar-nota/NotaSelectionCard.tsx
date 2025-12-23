import { Checkbox } from '@/components/ui/checkbox';
import { formatCurrency } from '@/lib/masks';
import { maskCNPJ } from '@/lib/masks';
import { FileText, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { NotaExtraida, DuplicataInfo } from './types';

interface NotaSelectionCardProps {
  nota: NotaExtraida;
  index: number;
  selected: boolean;
  onToggle: () => void;
  duplicata?: DuplicataInfo | null;
}

export function NotaSelectionCard({ nota, index, selected, onToggle, duplicata }: NotaSelectionCardProps) {
  const isBlocked = duplicata?.tipo === 'hash';
  
  return (
    <div
      className={cn(
        "border rounded-lg p-4 transition-all",
        isBlocked ? "opacity-50 border-destructive bg-destructive/5" :
        selected ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
      )}
    >
      <div className="flex items-start gap-3">
        <Checkbox
          checked={selected}
          onCheckedChange={onToggle}
          disabled={isBlocked}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2">
            <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
            <span className="font-medium">Página {nota.pagina}</span>
            {nota.confidence_label === 'alta' ? (
              <CheckCircle className="h-4 w-4 text-success" />
            ) : nota.confidence_label === 'media' ? (
              <AlertTriangle className="h-4 w-4 text-warning" />
            ) : (
              <XCircle className="h-4 w-4 text-destructive" />
            )}
          </div>
          
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Valor:</span>
              <span className="font-medium">
                {nota.total_value ? formatCurrency(nota.total_value) : 'Não identificado'}
              </span>
            </div>
            
            {nota.extracted_fields?.numero_nota && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Nº Nota:</span>
                <span>{nota.extracted_fields.numero_nota}</span>
              </div>
            )}
            
            {nota.extracted_fields?.cnpj_emitente && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">CNPJ:</span>
                <span className="font-mono text-xs">{maskCNPJ(nota.extracted_fields.cnpj_emitente)}</span>
              </div>
            )}
            
            {nota.extracted_fields?.nome_emitente && (
              <div className="flex justify-between">
                <span className="text-muted-foreground">Emitente:</span>
                <span className="truncate max-w-[200px]">{nota.extracted_fields.nome_emitente}</span>
              </div>
            )}
          </div>
          
          {duplicata && (
            <div className={cn(
              "mt-2 p-2 rounded text-xs",
              duplicata.tipo === 'hash' ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"
            )}>
              {duplicata.tipo === 'hash' ? 
                'Este arquivo já foi importado' : 
                'Possível duplicata (nota + CNPJ já existem)'
              }
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
