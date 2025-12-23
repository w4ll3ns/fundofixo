import { useSearchParams } from 'react-router-dom';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FormNovaSolicitacao } from '@/components/solicitacoes/FormNovaSolicitacao';
import { ImportarNota } from '@/components/solicitacoes/ImportarNota';
import { ListaSolicitacoes } from '@/components/solicitacoes/ListaSolicitacoes';
import { PlusCircle, FileText, List } from 'lucide-react';

export default function MinhasSolicitacoes() {
  const [searchParams, setSearchParams] = useSearchParams();
  const currentTab = searchParams.get('tab') || 'lista';
  const statusFilter = searchParams.get('status');

  const handleTabChange = (value: string) => {
    const params = new URLSearchParams();
    params.set('tab', value);
    // Preserve status filter when switching to lista tab
    if (value === 'lista' && statusFilter) {
      params.set('status', statusFilter);
    }
    setSearchParams(params);
  };

  const handleFormSuccess = () => {
    setSearchParams({ tab: 'lista' });
  };

  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Solicitações</h1>
          <p className="text-muted-foreground">Gerencie suas solicitações de fundo fixo</p>
        </div>

        <Tabs value={currentTab} onValueChange={handleTabChange} className="w-full">
          <TabsList className="grid w-full grid-cols-3 lg:w-auto lg:inline-grid">
            <TabsTrigger value="nova" className="gap-2">
              <PlusCircle className="h-4 w-4 hidden sm:inline" />
              Nova
            </TabsTrigger>
            <TabsTrigger value="importar" className="gap-2">
              <FileText className="h-4 w-4 hidden sm:inline" />
              Importar
            </TabsTrigger>
            <TabsTrigger value="lista" className="gap-2">
              <List className="h-4 w-4 hidden sm:inline" />
              Minhas
            </TabsTrigger>
          </TabsList>

          <div className="mt-6">
            <TabsContent value="nova" className="m-0">
              <FormNovaSolicitacao onSuccess={handleFormSuccess} />
            </TabsContent>

            <TabsContent value="importar" className="m-0">
              <ImportarNota onSuccess={handleFormSuccess} />
            </TabsContent>

            <TabsContent value="lista" className="m-0">
              <ListaSolicitacoes defaultStatusFilter={statusFilter || undefined} />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </AppLayout>
  );
}
