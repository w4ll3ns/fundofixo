import { useState, useEffect } from 'react';
import { Bell } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface Notification {
  id: string;
  titulo: string;
  mensagem: string;
  lida: boolean;
  tipo: string;
  link: string | null;
  created_at: string;
}

export function NotificationBell() {
  const { user } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    if (!user) return;

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notificacoes')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);

      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.lida).length);
      }
    };

    fetchNotifications();
  }, [user]);

  const markAsRead = async (id: string) => {
    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('id', id);

    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, lida: true } : n)
    );
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllAsRead = async () => {
    if (!user) return;
    
    await supabase
      .from('notificacoes')
      .update({ lida: true })
      .eq('user_id', user.id)
      .eq('lida', false);

    setNotifications(prev => prev.map(n => ({ ...n, lida: true })));
    setUnreadCount(0);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-destructive text-destructive-foreground text-xs flex items-center justify-center">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <h3 className="font-semibold">Notificações</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllAsRead}>
              Marcar todas como lidas
            </Button>
          )}
        </div>
        <div className="max-h-80 overflow-y-auto">
          {notifications.length === 0 ? (
            <div className="p-4 text-center text-muted-foreground">
              Nenhuma notificação
            </div>
          ) : (
            notifications.map((notification) => (
              <div
                key={notification.id}
                onClick={() => !notification.lida && markAsRead(notification.id)}
                className={cn(
                  'p-4 border-b border-border cursor-pointer transition-colors',
                  !notification.lida ? 'bg-accent' : 'hover:bg-muted'
                )}
              >
                <div className="flex items-start gap-3">
                  <div className={cn(
                    'w-2 h-2 mt-2 rounded-full flex-shrink-0',
                    !notification.lida ? 'bg-primary' : 'bg-transparent'
                  )} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm">{notification.titulo}</p>
                    <p className="text-sm text-muted-foreground line-clamp-2">
                      {notification.mensagem}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(notification.created_at), {
                        addSuffix: true,
                        locale: ptBR
                      })}
                    </p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
