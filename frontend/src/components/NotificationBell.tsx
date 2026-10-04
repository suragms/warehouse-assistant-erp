import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ExternalLink } from 'lucide-react';
import { notificationApi, type NotificationDto } from '../api/notificationApi';
import { notificationKeys } from '../lib/queryKeys';
import { useLocation, useNavigate } from 'react-router-dom';
import { notificationTarget } from '../lib/notificationTarget';

export function NotificationBell() {
  const navigate = useNavigate();
  const location = useLocation();
  const [openLocationKey, setOpenLocationKey] = useState<string | null>(null);
  const open = openLocationKey === location.key;
  const container = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const queryClient = useQueryClient();

  const { data: unreadData } = useQuery({
    queryKey: notificationKeys.unreadCount(),
    queryFn: () => notificationApi.getUnreadCount(),
    // Shared cache is refreshed by notification.changed and reconnect events.
  });

  const { data: listData, isPending, isError, refetch } = useQuery({
    queryKey: notificationKeys.list({ page: 1, pageSize: 10 }),
    queryFn: () => notificationApi.getNotifications(1, 10, false),
    enabled: open,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => notificationApi.markAsRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => notificationApi.markAllAsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: notificationKeys.all });
    },
  });

  const unreadCount = unreadData ?? 0;
  const notifications = listData?.data || [];
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!container.current?.contains(event.target as Node)) setOpenLocationKey(null); };
    const key = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpenLocationKey(null); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', outside);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', key); };
  }, [open]);

  const handleNotificationClick = (n: NotificationDto) => {
    if (!n.isRead) {
      markReadMutation.mutate(n.id);
    }
    setOpenLocationKey(null);
    const target = notificationTarget(n); if (target) navigate(target);
  };

  return (
    <div ref={container} className="relative">
      <button
        ref={trigger}
        onClick={() => setOpenLocationKey(open ? null : location.key)}
        className="mobile-icon-button relative p-2 text-slate-600 hover:text-[#0E4F46] hover:bg-slate-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#159A8A]"
        aria-label="Notifications"
        aria-expanded={open}
        aria-controls="notification-preview"
        aria-describedby={unreadCount > 0 ? 'notification-unread' : undefined}
      >
        <Bell className="w-5 h-5" />
        {unreadCount > 0 && (
          <><span aria-hidden="true" className="absolute top-0.5 right-0 min-w-5 h-5 px-1 bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center">{unreadCount > 9 ? '9+' : unreadCount}</span><span id="notification-unread" className="sr-only">{unreadCount} unread notifications</span></>
        )}
      </button>

      {open && (
        <div id="notification-preview" role="region" aria-label="Notification preview" className="mobile-notification-panel absolute right-0 mt-2 w-80 sm:w-96 bg-white border border-slate-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-3 border-b border-slate-100 flex flex-wrap gap-2 items-center justify-between bg-slate-50 shrink-0">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-slate-900 text-sm">Notifications</h3>
              {unreadCount > 0 && (
                <span className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs font-semibold rounded-full">
                  {unreadCount} new
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button
                  onClick={() => markAllReadMutation.mutate()}
                  disabled={markAllReadMutation.isPending}
                  className="min-h-11 text-xs font-medium text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
                >
                  <CheckCheck className="w-3.5 h-3.5" /> Mark all read
                </button>
              )}
            </div>
          </div>

          <div className="max-h-96 min-h-0 overflow-y-auto divide-y divide-slate-100">
            {isPending ? <p role="status" className="p-4 text-sm">Loading notifications…</p> : isError ? <p role="alert" className="p-4 text-sm">Notifications could not be loaded. <button className="min-h-11 underline" onClick={() => void refetch()}>Retry notifications</button></p> : notifications.length === 0 ? (
              <div className="p-8 text-center text-slate-400 text-sm">
                No notifications found.
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  type="button"
                  disabled={markReadMutation.isPending}
                  key={n.id}
                  onClick={() => handleNotificationClick(n)}
                  className={`w-full min-h-11 text-left p-3.5 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#159A8A] transition-colors flex items-start gap-3 ${
                    !n.isRead ? 'bg-indigo-50/40' : ''
                  }`}
                >
                  <div
                    className={`w-2 h-2 rounded-full mt-2 shrink-0 ${
                      !n.isRead ? 'bg-indigo-600' : 'bg-transparent'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-semibold text-slate-900 truncate ${!n.isRead ? 'font-bold' : ''}`}>
                      {n.title}
                    </p>
                    <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">{n.message}</p>
                    <p className="text-[10px] text-slate-400 mt-1">
                      {new Date(n.createdAt).toLocaleString()}
                    </p>
                  </div>
                  {notificationTarget(n) && (
                    <ExternalLink className="w-4 h-4 text-slate-400 shrink-0 self-center" />
                  )}
                </button>
              ))
            )}
          </div>

          {(markReadMutation.isError || markAllReadMutation.isError) && <p role="alert" className="px-3 py-2 text-sm text-red-700">Read status could not be saved. Try again.</p>}

          <div className="p-2 border-t border-slate-100 bg-slate-50 text-center shrink-0">
            <button
              onClick={() => {
                setOpenLocationKey(null);
                navigate('/notifications');
              }}
              className="min-h-11 px-3 text-sm font-semibold text-indigo-600 hover:text-indigo-800 focus-visible:ring-2 focus-visible:ring-[#159A8A]"
            >
              View all notifications →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
