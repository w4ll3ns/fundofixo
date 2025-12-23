import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { maskCurrency, parseCurrency } from '@/lib/masks';
import { Loader2, ArrowLeft } from 'lucide-react';
import { z } from 'zod';

interface Empresa {
  id: string;
  nome_fantasia: string;
  unidade: string | null;
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
  valor_solicitado: z.number().positive('Valor deve ser maior que zero'),
  justificativa: z.string().min(10, 'Justificativa deve ter no mínimo 10 caracteres'),
  categoria: z.string().optional(),
});

export default function NovaSolicitacao() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { toast } = useToast();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(false);
  const [valorDisplay, setValorDisplay] = useState('');
  
  const [form, setForm] = useState({
    empresa_id: '',
    valor_solicitado: 0,
    justificativa: '',
    categoria: '',
  });

  useEffect(() => {
    const fetchEmpresas = async () => {
      const { data } = await supabase
        .from('empresas')
        .select('id, nome_fantasia, unidade')
        .eq('status', true)
        .order('nome_fantasia');
      
      if (data) setEmpresas(data);
    };

    fetchEmpresas();
  }, []);

  const handleValorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    const masked = maskCurrency(value);
    setValorDisplay(masked);
    setForm({ ...form, valor_solicitado: parseCurrency(masked) });
  };

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

      const { error } = await supabase.from('solicitacoes').insert({
        empresa_id: form.empresa_id,
        solicitante_user_id: user?.id,
        valor_solicitado: form.valor_solicitado,
        justificativa: form.justificativa,
        categoria: form.categoria || null,
        status: 'enviada',
      });

      if (error) throw error;

      toast({
        title: 'Solicitação enviada!',
        description: 'Sua solicitação foi enviada para aprovação.',
      });
      navigate('/minhas-solicitacoes');
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
    <AppLayout>
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <Button variant="ghost" onClick={() => navigate(-1)} className="gap-2">
          <ArrowLeft className="h-4 w-4" />
          Voltar
        </Button>

        <Card>
          <CardHeader>
            <CardTitle>Nova Solicitação de Fundo Fixo</CardTitle>
            <CardDescription>
              Preencha os dados abaixo para solicitar retirada do fundo fixo
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
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

              <div className="flex gap-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => navigate(-1)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={loading} className="flex-1">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Enviar Solicitação
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
