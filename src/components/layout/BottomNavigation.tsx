import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { Home, PlusCircle, FileText, Building2, User, Wallet, Download, MoreHorizontal, BarChart3, Settings, ChevronRight } from 'lucide-react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

export function BottomNavigation() {
  const { isAdmin } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [moreOpen, setMoreOpen] = useState(false);

  const userItems = [
    { icon: Home, label: 'Início', path: '/dashboard' },
    { icon: PlusCircle, label: 'Solicitar', path: '/nova-solicitacao' },
    { icon: FileText, label: 'Minhas', path: '/minhas-solicitacoes' },
    { icon: User, label: 'Perfil', path: '/perfil' },
  ];

  const adminMainItems = [
    { icon: Home, label: 'Início', path: '/admin' },
    { icon: FileText, label: 'Solicitações', path: '/admin/solicitacoes' },
    { icon: Download, label: 'Baixas', path: '/admin/baixas-pendentes' },
    { icon: Wallet, label: 'Saldos', path: '/admin/gestao-saldo' },
  ];

  const adminMoreItems = [
    { icon: Building2, label: 'Empresas', path: '/admin/empresas' },
    { icon: BarChart3, label: 'Relatórios', path: '/admin/relatorios' },
    { icon: Settings, label: 'Configurações', path: '/admin/configuracoes' },
    { icon: User, label: 'Perfil', path: '/perfil' },
  ];

  const items = isAdmin ? adminMainItems : userItems;

  const isActive = (path: string) => {
    if (path === '/dashboard' || path === '/admin') {
      return location.pathname === path;
    }
    return location.pathname.startsWith(path);
  };

  const isMoreItemActive = adminMoreItems.some(item => isActive(item.path));

  const handleMoreItemClick = (path: string) => {
    setMoreOpen(false);
    navigate(path);
  };

  return (
    <>
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-card border-t border-border safe-area-bottom lg:hidden">
        <div className="flex items-center justify-around h-16 px-2">
          {items.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors touch-manipulation relative',
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

          {isAdmin && (
            <button
              onClick={() => setMoreOpen(true)}
              className={cn(
                'flex flex-col items-center justify-center flex-1 h-full py-2 px-1 transition-colors touch-manipulation relative',
                'active:scale-95 active:opacity-80',
                isMoreItemActive
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MoreHorizontal className={cn('h-5 w-5 mb-1', isMoreItemActive && 'text-primary')} />
              <span className={cn(
                'text-[10px] font-medium leading-tight text-center',
                isMoreItemActive && 'text-primary'
              )}>
                Mais
              </span>
              {isMoreItemActive && (
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 bg-primary rounded-full" />
              )}
            </button>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="rounded-t-xl pb-safe">
          <SheetHeader className="pb-4">
            <SheetTitle>Mais opções</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col gap-1">
            {adminMoreItems.map((item) => {
              const active = isActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => handleMoreItemClick(item.path)}
                  className={cn(
                    'flex items-center gap-4 px-4 py-3 rounded-lg transition-colors text-left',
                    'active:scale-[0.98] active:opacity-80',
                    active
                      ? 'bg-primary/10 text-primary'
                      : 'hover:bg-muted text-foreground'
                  )}
                >
                  <item.icon className={cn('h-5 w-5', active && 'text-primary')} />
                  <span className={cn('flex-1 font-medium', active && 'text-primary')}>
                    {item.label}
                  </span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
