import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Eye, Plus, Trash2, Users, Building2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface UserProfile {
  id: string;
  user_id: string;
  nome: string;
  email: string;
}

interface Empresa {
  id: string;
  nome_fantasia: string;
  cnpj: string;
}

interface AcessoConsultivo {
  id: string;
  user_id: string;
  empresa_id: string;
  created_at: string;
  created_by: string | null;
  profiles?: UserProfile;
  empresas?: Empresa;
}

export default function AcessosConsultivos() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectedEmpresaId, setSelectedEmpresaId] = useState<string>('');

  // Fetch all profiles
  const { data: profiles = [], isLoading: loadingProfiles } = useQuery({
    queryKey: ['admin-profiles'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('nome');
      if (error) throw error;
      return data as UserProfile[];
    },
  });

  // Fetch all empresas
  const { data: empresas = [], isLoading: loadingEmpresas } = useQuery({
    queryKey: ['admin-empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresas')
        .select('*')
        .eq('status', true)
        .order('nome_fantasia');
      if (error) throw error;
      return data as Empresa[];
    },
  });

  // Fetch all acessos
  const { data: acessos = [], isLoading: loadingAcessos } = useQuery({
    queryKey: ['acessos-consultivos'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('usuario_empresa_acesso')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Enrich acessos with profile and empresa data
  const enrichedAcessos = acessos.map(acesso => ({
    ...acesso,
    profile: profiles.find(p => p.user_id === acesso.user_id),
    empresa: empresas.find(e => e.id === acesso.empresa_id),
  }));

  // Add acesso mutation
  const addAcessoMutation = useMutation({
    mutationFn: async ({ userId, empresaId }: { userId: string; empresaId: string }) => {
      const { error } = await supabase
        .from('usuario_empresa_acesso')
        .insert({
          user_id: userId,
          empresa_id: empresaId,
          created_by: user?.id,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acessos-consultivos'] });
      toast.success('Acesso consultivo adicionado com sucesso');
      setSelectedUserId('');
      setSelectedEmpresaId('');
    },
    onError: (error: Error) => {
      if (error.message.includes('duplicate')) {
        toast.error('Este usuário já possui acesso a esta empresa');
      } else {
        toast.error('Erro ao adicionar acesso: ' + error.message);
      }
    },
  });

  // Remove acesso mutation
  const removeAcessoMutation = useMutation({
    mutationFn: async (acessoId: string) => {
      const { error } = await supabase
        .from('usuario_empresa_acesso')
        .delete()
        .eq('id', acessoId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['acessos-consultivos'] });
      toast.success('Acesso consultivo removido');
    },
    onError: (error: Error) => {
      toast.error('Erro ao remover acesso: ' + error.message);
    },
  });

  const handleAddAcesso = () => {
    if (!selectedUserId || !selectedEmpresaId) {
      toast.error('Selecione um usuário e uma empresa');
      return;
    }
    addAcessoMutation.mutate({ userId: selectedUserId, empresaId: selectedEmpresaId });
  };

  const isLoading = loadingProfiles || loadingEmpresas || loadingAcessos;

  // Group acessos by user for summary
  const acessosByUser = enrichedAcessos.reduce((acc, acesso) => {
    const userId = acesso.user_id;
    if (!acc[userId]) {
      acc[userId] = {
        profile: acesso.profile,
        empresas: [],
      };
    }
    if (acesso.empresa) {
      acc[userId].empresas.push(acesso.empresa);
    }
    return acc;
  }, {} as Record<string, { profile?: UserProfile; empresas: Empresa[] }>);

  const usersWithAccess = Object.keys(acessosByUser).length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{usersWithAccess}</p>
                <p className="text-sm text-muted-foreground">Usuários com acesso consultivo</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-primary/10 rounded-lg">
                <Eye className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{acessos.length}</p>
                <p className="text-sm text-muted-foreground">Acessos configurados</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Add New Access Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5" />
            Adicionar Acesso Consultivo
          </CardTitle>
          <CardDescription>
            Selecione um usuário e uma empresa para conceder acesso consultivo aos relatórios
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um usuário" />
                </SelectTrigger>
                <SelectContent>
                  {profiles.map((profile) => (
                    <SelectItem key={profile.user_id} value={profile.user_id}>
                      {profile.nome} ({profile.email})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex-1">
              <Select value={selectedEmpresaId} onValueChange={setSelectedEmpresaId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione uma empresa" />
                </SelectTrigger>
                <SelectContent>
                  {empresas.map((empresa) => (
                    <SelectItem key={empresa.id} value={empresa.id}>
                      {empresa.nome_fantasia}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button 
              onClick={handleAddAcesso} 
              disabled={!selectedUserId || !selectedEmpresaId || addAcessoMutation.isPending}
            >
              <Plus className="h-4 w-4 mr-2" />
              Adicionar
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Acessos List */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Building2 className="h-5 w-5" />
            Acessos Configurados
          </CardTitle>
          <CardDescription>
            Lista de todos os acessos consultivos configurados no sistema
          </CardDescription>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-12 w-full" />
              ))}
            </div>
          ) : enrichedAcessos.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Nenhum acesso consultivo configurado</p>
              <p className="text-sm">Adicione acessos usando o formulário acima</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Usuário</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Empresa</TableHead>
                    <TableHead>Adicionado em</TableHead>
                    <TableHead className="text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrichedAcessos.map((acesso) => (
                    <TableRow key={acesso.id}>
                      <TableCell className="font-medium">
                        {acesso.profile?.nome || 'N/A'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {acesso.profile?.email || 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {acesso.empresa?.nome_fantasia || 'N/A'}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(parseISO(acesso.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => removeAcessoMutation.mutate(acesso.id)}
                          disabled={removeAcessoMutation.isPending}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Summary by User */}
      {usersWithAccess > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resumo por Usuário</CardTitle>
            <CardDescription>
              Visão consolidada dos acessos de cada usuário
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(acessosByUser).map(([userId, data]) => (
                <div key={userId} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border rounded-lg gap-3">
                  <div>
                    <p className="font-medium">{data.profile?.nome || 'Usuário'}</p>
                    <p className="text-sm text-muted-foreground">{data.profile?.email}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {data.empresas.map((empresa) => (
                      <Badge key={empresa.id} variant="secondary">
                        {empresa.nome_fantasia}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
