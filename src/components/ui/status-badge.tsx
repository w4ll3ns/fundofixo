import { cn } from '@/lib/utils';

type StatusType = 'enviada' | 'aprovada' | 'entregue' | 'rejeitada' | 'baixada' | 'pendente_ajuste';

interface StatusBadgeProps {
  status: StatusType;
  className?: string;
}

const statusConfig: Record<StatusType, { label: string; className: string }> = {
  enviada: {
    label: 'Enviada',
    className: 'bg-info/10 text-info border-info/20',
  },
  aprovada: {
    label: 'Aprovada',
    className: 'bg-primary/10 text-primary border-primary/20',
  },
  entregue: {
    label: 'Entregue',
    className: 'bg-success/10 text-success border-success/20',
  },
  rejeitada: {
    label: 'Rejeitada',
    className: 'bg-destructive/10 text-destructive border-destructive/20',
  },
  baixada: {
    label: 'Baixada',
    className: 'bg-muted text-muted-foreground border-border',
  },
  pendente_ajuste: {
    label: 'Pendente Ajuste',
    className: 'bg-warning/10 text-warning border-warning/20',
  },
};

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const config = statusConfig[status];

  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border',
        config.className,
        className
      )}
    >
      {config.label}
    </span>
  );
}
