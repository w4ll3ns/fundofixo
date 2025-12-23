import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Mail, Settings } from 'lucide-react';
import GestaoUsuarios from './configuracoes/GestaoUsuarios';
import DominiosEmail from './configuracoes/DominiosEmail';

export default function Configuracoes() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie usuários, domínios permitidos e configurações do sistema</p>
        </div>

        <Tabs defaultValue="usuarios" className="space-y-4">
          <TabsList className="grid w-full grid-cols-2 lg:w-auto lg:inline-grid">
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="dominios" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Domínios de Email</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios">
            <GestaoUsuarios />
          </TabsContent>

          <TabsContent value="dominios">
            <DominiosEmail />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
