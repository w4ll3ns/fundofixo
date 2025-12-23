import { ReactNode, useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { NotificationBell } from '@/components/notifications/NotificationBell';
import { BottomNavigation } from './BottomNavigation';
import { 
  Home, 
  PlusCircle, 
  FileText, 
  Building2, 
  BarChart3, 
  LogOut,
  Menu,
  X,
  Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface AppLayoutProps {
  children: ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleSignOut = async () => {
    await signOut();
    navigate('/auth');
  };

  const userMenuItems = [
    { icon: Home, label: 'Dashboard', path: '/dashboard' },
    { icon: PlusCircle, label: 'Nova Solicitação', path: '/nova-solicitacao' },
    { icon: FileText, label: 'Minhas Solicitações', path: '/minhas-solicitacoes' },
  ];

  const adminMenuItems = [
    { icon: Home, label: 'Dashboard', path: '/admin' },
    { icon: Wallet, label: 'Gestão de Saldo', path: '/admin/gestao-saldo' },
    { icon: Building2, label: 'Empresas', path: '/admin/empresas' },
    { icon: FileText, label: 'Solicitações', path: '/admin/solicitacoes' },
    { icon: BarChart3, label: 'Relatórios', path: '/admin/relatorios' },
  ];

  const menuItems = isAdmin ? adminMenuItems : userMenuItems;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header - Compact on mobile */}
      <header className="sticky top-0 z-50 border-b border-border bg-card/95 backdrop-blur supports-[backdrop-filter]:bg-card/80">
        <div className="flex h-14 lg:h-16 items-center justify-between px-4 lg:px-6">
          <Link to={isAdmin ? '/admin' : '/dashboard'} className="flex items-center gap-2">
            <Wallet className="h-6 w-6 lg:h-7 lg:w-7 text-primary" />
            <span className="text-lg lg:text-xl font-semibold text-foreground">Caixinha</span>
          </Link>

          <div className="flex items-center gap-2 lg:gap-3">
            <NotificationBell />
            <div className="hidden sm:block text-sm text-muted-foreground max-w-32 truncate">
              {user?.email}
            </div>
            <Button variant="ghost" size="icon" onClick={handleSignOut} className="h-9 w-9">
              <LogOut className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar - Desktop only */}
        <aside className="hidden lg:flex w-64 flex-col border-r border-border bg-card min-h-[calc(100vh-4rem)]">
          <nav className="flex-1 p-4 space-y-1">
            {menuItems.map((item) => (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  location.pathname === item.path
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-accent">
              <div className={cn(
                'px-2 py-0.5 text-xs font-medium rounded',
                isAdmin ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
              )}>
                {isAdmin ? 'ADMIN' : 'USUÁRIO'}
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 p-4 lg:p-6 pb-20 lg:pb-6 overflow-y-auto">
          {children}
        </main>
      </div>

      {/* Bottom Navigation - Mobile only */}
      <BottomNavigation />
    </div>
  );
}
