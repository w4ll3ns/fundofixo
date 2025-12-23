import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Home, PlusCircle, FileText, Building2, BarChart3, User, Wallet } from 'lucide-react';

export function BottomNavigation() {
  const { isAdmin } = useAuth();
  const location = useLocation();

  const userItems = [
    { icon: Home, label: 'Início', path: '/dashboard' },
    { icon: PlusCircle, label: 'Solicitar', path: '/nova-solicitacao' },
    { icon: FileText, label: 'Minhas', path: '/minhas-solicitacoes' },
    { icon: User, label: 'Perfil', path: '/perfil' },
  ];

  const adminItems = [
    { icon: Home, label: 'Início', path: '/admin' },
    { icon: FileText, label: 'Solicitações', path: '/admin/solicitacoes' },
    { icon: Wallet, label: 'Saldos', path: '/admin/gestao-saldo' },
    { icon: Building2, label: 'Empresas', path: '/admin/empresas' },
    { icon: User, label: 'Perfil', path: '/perfil' },
  ];

  const items = isAdmin ? adminItems : userItems;

  const isActive = (path: string) => {
    if (path === '/dashboard' || path === '/admin') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom lg:hidden">
      <div className="flex items-center justify-around h-16 px-2">
        {items.map((item) => {
          const active = isActive(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors touch-manipulation',
                'active:scale-95 active:opacity-80',
                active
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <item.icon className={cn('h-5 w-5 mb-1', active && 'text-primary')} />
              <span className={cn(
                'text-[10px] font-medium leading-tight text-center',
                active && 'text-primary'
              )}>
                {item.label}
              </span>
              {active && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
