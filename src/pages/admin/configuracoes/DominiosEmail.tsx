import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2, Mail, AlertCircle } from 'lucide-react';
import { z } from 'zod';

interface DominioEmail {
  id: string;
  dominio: string;
  ativo: boolean;
  created_at: string;
}

const dominioSchema = z.string()
  .min(3, 'Domínio deve ter pelo menos 3 caracteres')
  .regex(/^[a-zA-Z0-9][a-zA-Z0-9-]*\.[a-zA-Z]{2,}$/, 'Formato de domínio inválido (ex: empresa.com.br)');

export default function DominiosEmail() {
  const { toast } = useToast();
  const [dominios, setDominios] = useState<DominioEmail[]>([]);
  const [loading, setLoading] = useState(true);
  const [novoDominio, setNovoDominio] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchDominios();
  }, []);

  const fetchDominios = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('dominios_email_permitidos')
        .select('*')
        .order('dominio');

      if (error) throw error;
      setDominios(data || []);
    } catch (error: any) {
      toast({
        title: 'Erro ao carregar domínios',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddDominio = async () => {
    const cleanDominio = novoDominio.replace('@', '').toLowerCase().trim();
    
    const validation = dominioSchema.safeParse(cleanDominio);
    if (!validation.success) {
      toast({
        title: 'Domínio inválido',
        description: validation.error.errors[0].message,
        variant: 'destructive',
      });
      return;
    }

    // Verificar duplicados
    if (dominios.some(d => d.dominio === cleanDominio)) {
      toast({
        title: 'Domínio já existe',
        description: 'Este domínio já está na lista.',
        variant: 'destructive',
      });
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('dominios_email_permitidos')
        .insert({ dominio: cleanDominio });

      if (error) throw error;

      toast({
        title: 'Domínio adicionado',
        description: `O domínio @${cleanDominio} foi adicionado com sucesso.`,
      });

      setNovoDominio('');
      setDialogOpen(false);
      fetchDominios();
    } catch (error: any) {
      toast({
        title: 'Erro ao adicionar',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleAtivo = async (dominio: DominioEmail) => {
    try {
      const { error } = await supabase
        .from('dominios_email_permitidos')
        .update({ ativo: !dominio.ativo })
        .eq('id', dominio.id);

      if (error) throw error;

      toast({
        title: dominio.ativo ? 'Domínio desativado' : 'Domínio ativado',
        description: `O domínio @${dominio.dominio} foi ${dominio.ativo ? 'desativado' : 'ativado'}.`,
      });

      fetchDominios();
    } catch (error: any) {
      toast({
        title: 'Erro ao atualizar',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (dominio: DominioEmail) => {
    try {
      const { error } = await supabase
        .from('dominios_email_permitidos')
        .delete()
        .eq('id', dominio.id);

      if (error) throw error;

      toast({
        title: 'Domínio removido',
        description: `O domínio @${dominio.dominio} foi removido.`,
      });

      fetchDominios();
    } catch (error: any) {
      toast({
        title: 'Erro ao remover',
        description: error.message,
        variant: 'destructive',
      });
    }
  };

  const dominiosAtivos = dominios.filter(d => d.ativo).length;

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Domínios de Email Permitidos</CardTitle>
            <CardDescription>
              Configure quais domínios de email podem se cadastrar no sistema.
              {dominios.length === 0 && (
                <span className="block mt-1 text-amber-600 dark:text-amber-400">
                  ⚠️ Nenhum domínio configurado. Qualquer email poderá se cadastrar.
                </span>
              )}
            </CardDescription>
          </div>
          
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Adicionar Domínio
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Adicionar Domínio</DialogTitle>
                <DialogDescription>
                  Informe o domínio de email permitido para cadastro (ex: empresa.com.br)
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="novo-dominio">Domínio</Label>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground">@</span>
                    <Input
                      id="novo-dominio"
                      placeholder="empresa.com.br"
                      value={novoDominio}
                      onChange={(e) => setNovoDominio(e.target.value)}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Apenas usuários com este domínio de email poderão se cadastrar.
                  </p>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setDialogOpen(false)}>
                  Cancelar
                </Button>
                <Button onClick={handleAddDominio} disabled={saving || !novoDominio.trim()}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Adicionar
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {dominios.length > 0 && (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Mail className="h-4 w-4" />
            <span>{dominiosAtivos} domínio(s) ativo(s) de {dominios.length} total</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : dominios.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium mb-1">Nenhum domínio configurado</h3>
            <p className="text-muted-foreground text-sm max-w-sm">
              Adicione domínios de email para restringir quem pode se cadastrar no sistema.
            </p>
          </div>
        ) : (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Domínio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[120px]">Ações</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {dominios.map((dominio) => (
                  <TableRow key={dominio.id}>
                    <TableCell className="font-medium">@{dominio.dominio}</TableCell>
                    <TableCell>
                      {dominio.ativo ? (
                        <Badge variant="default" className="bg-green-600">Ativo</Badge>
                      ) : (
                        <Badge variant="secondary">Inativo</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleToggleAtivo(dominio)}
                          title={dominio.ativo ? 'Desativar' : 'Ativar'}
                        >
                          {dominio.ativo ? (
                            <ToggleRight className="h-4 w-4 text-green-600" />
                          ) : (
                            <ToggleLeft className="h-4 w-4 text-muted-foreground" />
                          )}
                        </Button>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" title="Remover">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Remover domínio?</AlertDialogTitle>
                              <AlertDialogDescription>
                                O domínio @{dominio.dominio} será removido permanentemente.
                                Novos usuários com este domínio não poderão se cadastrar.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancelar</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(dominio)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                Remover
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
