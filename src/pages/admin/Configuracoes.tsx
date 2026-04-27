import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, Mail, Eye, Sparkles } from 'lucide-react';
import GestaoUsuarios from './configuracoes/GestaoUsuarios';
import DominiosEmail from './configuracoes/DominiosEmail';
import AcessosConsultivos from './configuracoes/AcessosConsultivos';
import InteligenciaArtificial from './configuracoes/InteligenciaArtificial';

export default function Configuracoes() {
  return (
    <AppLayout>
      <div className="space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-bold">Configurações</h1>
          <p className="text-muted-foreground">Gerencie usuários, domínios, acessos e provedor de IA</p>
        </div>

        <Tabs defaultValue="usuarios" className="space-y-4">
          <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-grid">
            <TabsTrigger value="usuarios" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              <span className="hidden sm:inline">Usuários</span>
            </TabsTrigger>
            <TabsTrigger value="dominios" className="flex items-center gap-2">
              <Mail className="h-4 w-4" />
              <span className="hidden sm:inline">Domínios</span>
            </TabsTrigger>
            <TabsTrigger value="acessos" className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              <span className="hidden sm:inline">Acessos</span>
            </TabsTrigger>
            <TabsTrigger value="ia" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span className="hidden sm:inline">IA</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="usuarios">
            <GestaoUsuarios />
          </TabsContent>

          <TabsContent value="dominios">
            <DominiosEmail />
          </TabsContent>

          <TabsContent value="acessos">
            <AcessosConsultivos />
          </TabsContent>

          <TabsContent value="ia">
            <InteligenciaArtificial />
          </TabsContent>
        </Tabs>
      </div>
    </AppLayout>
  );
}
