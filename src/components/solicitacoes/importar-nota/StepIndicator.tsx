import { cn } from '@/lib/utils';
import type { ImportStep } from './types';

interface StepIndicatorProps {
  currentStep: ImportStep;
  hasMultipleNotas: boolean;
}

export function StepIndicator({ currentStep, hasMultipleNotas }: StepIndicatorProps) {
  const steps = hasMultipleNotas 
    ? [
        { key: 'upload', label: 'Upload' },
        { key: 'selecao', label: 'Seleção' },
        { key: 'form', label: 'Dados' },
        { key: 'confirm', label: 'Confirmar' },
      ]
    : [
        { key: 'upload', label: 'Upload' },
        { key: 'form', label: 'Dados' },
        { key: 'confirm', label: 'Confirmar' },
      ];

  const currentIndex = steps.findIndex(s => s.key === currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-2">
      {steps.map((step, index) => (
        <div key={step.key} className="flex items-center gap-2">
          <div className={cn(
            "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
            index <= currentIndex ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}>
            {index + 1}
          </div>
          {index < steps.length - 1 && (
            <div className={cn(
              "w-8 h-0.5",
              index < currentIndex ? "bg-primary" : "bg-muted"
            )} />
          )}
        </div>
      ))}
    </div>
  );
}
