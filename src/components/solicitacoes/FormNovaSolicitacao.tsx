import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCurrency, parseCurrency, formatCurrency } from '@/lib/masks';
import { LIMITE_MAXIMO_SOLICITACAO, TIPOS_SOLICITACAO, TIPOS_SOLICITACAO_LABELS, TipoSolicitacao } from '@/lib/constants';
import { Loader2, AlertTriangle, Info, Wallet } from 'lucide-react';
import { z } from 'zod';

interface Empresa {
  id: string;
  nome_fantasia: string;
  unidade: string | null;
}

interface Fundo {
  id: string;
  empresa_id: string;
  saldo_atual: number;
}

const categorias = [
  'Material de Escritório',
  'Material de Limpeza',
  'Transporte',
  'Alimentação',
  'Manutenção',
  'Serviços',
  'Outros',
];

const schema = z.object({
  empresa_id: z.string().min(1, 'Selecione uma empresa'),
  tipo_solicitacao: z.enum(['FUNDO_FIXO', 'COMPRA_AVULSA'], { required_error: 'Selecione o tipo de solicitação' }),
  valor_solicitado: z.number().positive('Valor deve ser maior que zero'),
  justificativa: z.string().min(10, 'Justificativa deve ter no mínimo 10 caracteres'),
  categoria: z.string().optional(),
});

interface FormNovaSolicitacaoProps {
  onSuccess?: () => void;
}

export function FormNovaSolicitacao({ onSuccess }: FormNovaSolicitacaoProps) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [fundos, setFundos] = useState<Fundo[]>([]);
  const [loading, setLoading] = useState(false);
  const [valorDisplay, setValorDisplay] = useState('');
  
  const [form, setForm] = useState({
    empresa_id: '',
    tipo_solicitacao: '' as TipoSolicitacao | '',
    valor_solicitado: 0,
    justificativa: '',
    categoria: '',
  });

  useEffect(() => {
    const fetchData = async () => {
      const [empresasRes, fundosRes] = await Promise.all([
        supabase
          .from('empresas')
          .select('id, nome_fantasia, unidade')
          .eq('status', true)
          .order('nome_fantasia'),
        supabase
          .from('fundos')
          .select('id, empresa_id, saldo_atual'),
      ]);
      
      if (empresasRes.data) setEmpresas(empresasRes.data);
      if (fundosRes.data) setFundos(fundosRes.data);
    };

    fetchData();
  }, []);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const masked = maskCurrency(value);
    setValorDisplay(masked);
    setForm({ ...form, valor_solicitado: parseCurrency(masked) });
  };

  const saldoDisponivel = fundos.find(f => f.empresa_id === form.empresa_id)?.saldo_atual || 0;
  
  const excedeLimiteMaximo = form.valor_solicitado > LIMITE_MAXIMO_SOLICITACAO;
  const excedeSaldo = form.tipo_solicitacao === 'FUNDO_FIXO' && form.valor_solicitado > saldoDisponivel;
  const podeEnviar = !excedeLimiteMaximo && !excedeSaldo;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const validation = schema.safeParse(form);
      if (!validation.success) {
        toast({
          title: 'Erro de validação',
          description: validation.error.errors[0].message,
          variant: 'destructive',
        });
        return;
      }

      if (excedeLimiteMaximo) {
        toast({
          title: 'Valor acima do limite',
          description: `O valor máximo permitido por solicitação é de ${formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}.`,
          variant: 'destructive',
        });
        return;
      }

      if (excedeSaldo) {
        toast({
          title: 'Saldo insuficiente',
          description: 'Saldo insuficiente no fundo fixo para esta solicitação.',
          variant: 'destructive',
        });
        return;
      }

      const { error } = await supabase.from('solicitacoes').insert({
        empresa_id: form.empresa_id,
        solicitante_user_id: user?.id,
        tipo_solicitacao: form.tipo_solicitacao as any,
        valor_solicitado: form.valor_solicitado,
        justificativa: form.justificativa,
        categoria: form.categoria || null,
        status: 'enviada',
        excedeu_saldo: false as any,
        excedeu_limite_maximo: false as any,
      } as any);

      if (error) throw error;

      toast({
        title: 'Solicitação enviada!',
        description: 'Sua solicitação foi enviada para aprovação.',
      });
      
      if (onSuccess) {
        onSuccess();
      } else {
        navigate('/minhas-solicitacoes?tab=lista');
      }
    } catch (error) {
      toast({
        title: 'Erro ao enviar',
        description: 'Não foi possível enviar sua solicitação. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova Solicitação</CardTitle>
        <CardDescription>
          Preencha os dados abaixo para solicitar retirada
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Alert className="mb-6">
          <Info className="h-4 w-4" />
          <AlertDescription>
            Valor máximo por solicitação: <strong>{formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}</strong>
          </AlertDescription>
        </Alert>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="tipo">Tipo de Solicitação *</Label>
            <Select
              value={form.tipo_solicitacao}
              onValueChange={(value) => setForm({ ...form, tipo_solicitacao: value as TipoSolicitacao })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo" />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(TIPOS_SOLICITACAO).map(([key, value]) => (
                  <SelectItem key={key} value={value}>
                    {TIPOS_SOLICITACAO_LABELS[key as TipoSolicitacao]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {form.tipo_solicitacao === 'FUNDO_FIXO' && (
              <p className="text-xs text-muted-foreground">
                Impacta diretamente o saldo do fundo fixo da empresa
              </p>
            )}
            {form.tipo_solicitacao === 'COMPRA_AVULSA' && (
              <p className="text-xs text-muted-foreground">
                Compra pontual fora do controle do caixa fixo
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="empresa">Empresa / Unidade *</Label>
            <Select
              value={form.empresa_id}
              onValueChange={(value) => setForm({ ...form, empresa_id: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione a empresa" />
              </SelectTrigger>
              <SelectContent>
                {empresas.map((empresa) => (
                  <SelectItem key={empresa.id} value={empresa.id}>
                    {empresa.nome_fantasia}
                    {empresa.unidade && ` - ${empresa.unidade}`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {form.tipo_solicitacao === 'FUNDO_FIXO' && form.empresa_id && (
            <Alert className={saldoDisponivel <= 0 ? 'border-warning' : ''}>
              <Wallet className="h-4 w-4" />
              <AlertDescription className="flex items-center gap-2">
                Saldo disponível: <strong className={saldoDisponivel <= 0 ? 'text-warning' : 'text-success'}>{formatCurrency(saldoDisponivel)}</strong>
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="valor">Valor Solicitado *</Label>
            <Input
              id="valor"
              type="text"
              placeholder="R$ 0,00"
              value={valorDisplay}
              onChange={handleValorChange}
              required
            />
            {excedeLimiteMaximo && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                O valor máximo permitido por solicitação é de {formatCurrency(LIMITE_MAXIMO_SOLICITACAO)}.
              </p>
            )}
            {excedeSaldo && !excedeLimiteMaximo && (
              <p className="text-sm text-destructive flex items-center gap-1">
                <AlertTriangle className="h-4 w-4" />
                Saldo insuficiente no fundo fixo para esta solicitação.
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="categoria">Categoria</Label>
            <Select
              value={form.categoria}
              onValueChange={(value) => setForm({ ...form, categoria: value })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma categoria (opcional)" />
              </SelectTrigger>
              <SelectContent>
                {categorias.map((cat) => (
                  <SelectItem key={cat} value={cat}>
                    {cat}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="justificativa">Justificativa *</Label>
            <Textarea
              id="justificativa"
              placeholder="Descreva o motivo da solicitação..."
              value={form.justificativa}
              onChange={(e) => setForm({ ...form, justificativa: e.target.value })}
              rows={4}
              required
            />
            <p className="text-xs text-muted-foreground">
              Mínimo de 10 caracteres
            </p>
          </div>

          <Button 
            type="submit" 
            disabled={loading || !podeEnviar || !form.tipo_solicitacao} 
            className="w-full"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Enviar Solicitação
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
