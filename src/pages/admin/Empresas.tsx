import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { maskCNPJ } from '@/lib/masks';
import { Plus, Pencil, Trash2, Search, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface Empresa {
  id: string;
  nome_fantasia: string;
  cnpj: string;
  unidade: string | null;
  status: boolean;
}

export default function Empresas() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingEmpresa, setEditingEmpresa] = useState<Empresa | null>(null);
  const [form, setForm] = useState({ nome_fantasia: '', cnpj: '', unidade: '', status: true });

  const fetchEmpresas = async () => {
    const { data } = await supabase.from('empresas').select('*').order('nome_fantasia');
    if (data) setEmpresas(data);
    setLoading(false);
  };

  useEffect(() => { fetchEmpresas(); }, []);

  const handleCNPJChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setForm({ ...form, cnpj: maskCNPJ(e.target.value) });
  };

  const openCreate = () => {
    setEditingEmpresa(null);
    setForm({ nome_fantasia: '', cnpj: '', unidade: '', status: true });
    setDialogOpen(true);
  };

  const openEdit = (empresa: Empresa) => {
    setEditingEmpresa(empresa);
    setForm({
      nome_fantasia: empresa.nome_fantasia,
      cnpj: maskCNPJ(empresa.cnpj),
      unidade: empresa.unidade || '',
      status: empresa.status,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.nome_fantasia || !form.cnpj) {
      toast({ title: 'Erro', description: 'Preencha todos os campos obrigatórios', variant: 'destructive' });
      return;
    }

    const cleanCNPJ = form.cnpj.replace(/\D/g, '');
    const payload = {
      nome_fantasia: form.nome_fantasia,
      cnpj: cleanCNPJ,
      unidade: form.unidade || null,
      status: form.status,
    };

    if (editingEmpresa) {
      const { error } = await supabase.from('empresas').update(payload).eq('id', editingEmpresa.id);
      if (error) {
        toast({ title: 'Erro ao atualizar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Empresa atualizada!' });
    } else {
      const { error } = await supabase.from('empresas').insert(payload);
      if (error) {
        toast({ title: 'Erro ao criar', description: error.message, variant: 'destructive' });
        return;
      }
      toast({ title: 'Empresa criada!' });
    }

    setDialogOpen(false);
    fetchEmpresas();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) {
      toast({ title: 'Erro ao excluir', description: error.message, variant: 'destructive' });
      return;
    }
    toast({ title: 'Empresa excluída!' });
    fetchEmpresas();
  };

  const filtered = empresas.filter(e =>
    e.nome_fantasia.toLowerCase().includes(search.toLowerCase()) ||
    e.cnpj.includes(search.replace(/\D/g, ''))
  );

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h1 className="text-2xl font-bold">Gerenciar Empresas</h1>
          <Button onClick={openCreate}>
            <Plus className="mr-2 h-4 w-4" />
            Nova Empresa
          </Button>
        </div>

        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nome ou CNPJ..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <Card className="overflow-hidden">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Carregando...</div>
          ) : filtered.length === 0 ? (
            <div className="p-8 text-center">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-muted-foreground">Nenhuma empresa encontrada</p>
            </div>
          ) : isMobile ? (
            // Mobile: Cards
            <div className="divide-y divide-border">
              {filtered.map((empresa) => (
                <div key={empresa.id} className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium truncate">{empresa.nome_fantasia}</p>
                      <p className="text-sm text-muted-foreground font-mono">{maskCNPJ(empresa.cnpj)}</p>
                    </div>
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-medium shrink-0",
                      empresa.status ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                    )}>
                      {empresa.status ? 'Ativo' : 'Inativo'}
                    </span>
                  </div>
                  {empresa.unidade && (
                    <p className="text-sm text-muted-foreground">Unidade: {empresa.unidade}</p>
                  )}
                  <div className="flex gap-2 pt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="flex-1 h-10"
                      onClick={() => openEdit(empresa)}
                    >
                      <Pencil className="h-4 w-4 mr-2" />
                      Editar
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button size="sm" variant="outline" className="h-10 text-destructive hover:text-destructive">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Esta ação não pode ser desfeita. A empresa será removida permanentemente.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(empresa.id)}>Excluir</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            // Desktop: Table
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left py-3 px-4 text-sm font-medium">Nome Fantasia</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">CNPJ</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Unidade</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Status</th>
                    <th className="text-left py-3 px-4 text-sm font-medium">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((empresa) => (
                    <tr key={empresa.id} className="border-t border-border hover:bg-muted/30">
                      <td className="py-3 px-4 text-sm font-medium">{empresa.nome_fantasia}</td>
                      <td className="py-3 px-4 text-sm">{maskCNPJ(empresa.cnpj)}</td>
                      <td className="py-3 px-4 text-sm">{empresa.unidade || '-'}</td>
                      <td className="py-3 px-4">
                        <span className={cn(
                          "px-2 py-1 rounded-full text-xs font-medium",
                          empresa.status ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground'
                        )}>
                          {empresa.status ? 'Ativo' : 'Inativo'}
                        </span>
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex gap-2">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(empresa)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Excluir empresa?</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Esta ação não pode ser desfeita. A empresa será removida permanentemente.
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => handleDelete(empresa.id)}>Excluir</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingEmpresa ? 'Editar Empresa' : 'Nova Empresa'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>Nome Fantasia *</Label>
                <Input
                  value={form.nome_fantasia}
                  onChange={(e) => setForm({ ...form, nome_fantasia: e.target.value })}
                  placeholder="Ex: OXYGENI HUB"
                />
              </div>
              <div className="space-y-2">
                <Label>CNPJ *</Label>
                <Input
                  value={form.cnpj}
                  onChange={handleCNPJChange}
                  placeholder="00.000.000/0000-00"
                  maxLength={18}
                />
              </div>
              <div className="space-y-2">
                <Label>Unidade/Descrição</Label>
                <Input
                  value={form.unidade}
                  onChange={(e) => setForm({ ...form, unidade: e.target.value })}
                  placeholder="Ex: Filial Centro"
                />
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={form.status}
                  onCheckedChange={(checked) => setForm({ ...form, status: checked })}
                />
                <Label>Empresa ativa</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancelar</Button>
              <Button onClick={handleSubmit}>{editingEmpresa ? 'Salvar' : 'Criar'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AppLayout>
  );
}
