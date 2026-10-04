import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Bell, CheckCheck, ExternalLink, Filter } from 'lucide-react';
import { notificationApi, type NotificationDto } from '../api/notificationApi';
import { notificationKeys } from '../lib/queryKeys';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/ui';
import { notificationTarget } from '../lib/notificationTarget';

export default function NotificationsPage() {
  const [page, setPage] = useState(1);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: notificationKeys.list({ page, onlyUnread }),
    queryFn: () => notificationApi.getNotifications(page, 15, onlyUnread),
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

  const notifications = data?.data || [];
  const meta = data?.meta;

  const handleItemClick = (n: NotificationDto) => {
    if (!n.isRead) {
      markReadMutation.mutate(n.id);
    }
    const target = notificationTarget(n); if (target) navigate(target);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="Notifications & Alerts"
          subtitle="Stay informed about stock thresholds, pending purchases, and operational events."
        />
        <div className="flex items-center gap-3">
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending || isLoading || isError}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium text-sm rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
          >
            <CheckCheck className="w-4 h-4 text-indigo-600" />
            Mark All as Read
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-medium text-slate-700">Filter:</span>
          <button
            onClick={() => {
              setOnlyUnread(false);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              !onlyUnread ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All
          </button>
          <button
            onClick={() => {
              setOnlyUnread(true);
              setPage(1);
            }}
            className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
              onlyUnread ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Unread Only
          </button>
        </div>
      </div>

      {/* List */}
      {(markReadMutation.isError || markAllReadMutation.isError) && <p role="alert">Read status could not be saved. Try again.</p>}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading notifications...</div>
        ) : isError ? <p role="alert" className="p-5">Notifications could not be loaded. <button className="underline" onClick={() => void refetch()}>Retry notifications</button></p> : notifications.length === 0 ? (
          <div className="p-16 text-center text-slate-500">
            <Bell className="w-12 h-12 mx-auto text-slate-300 mb-3" />
            <p className="font-medium">No notifications found</p>
            <p className="text-sm text-slate-400 mt-1">You're completely up to date!</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {notifications.map((n: NotificationDto) => (
              <button type="button" disabled={markReadMutation.isPending}
                key={n.id}
                onClick={() => handleItemClick(n)}
                className={`w-full text-left p-4 sm:p-5 hover:bg-slate-50 cursor-pointer transition-colors flex items-start gap-4 ${
                  !n.isRead ? 'bg-indigo-50/30' : ''
                }`}
              >
                <div
                  className={`w-3 h-3 rounded-full mt-1.5 shrink-0 ${
                    !n.isRead ? 'bg-indigo-600 ring-4 ring-indigo-100' : 'bg-slate-300'
                  }`}
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <h4 className={`text-sm text-slate-900 ${!n.isRead ? 'font-bold' : 'font-semibold'}`}>
                      {n.title}
                    </h4>
                    <span className="px-2 py-0.5 bg-slate-100 text-slate-600 text-[10px] font-semibold rounded-full uppercase tracking-wider">
                      {n.type}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600 mt-1">{n.message}</p>
                  <p className="text-xs text-slate-400 mt-2">
                    {new Date(n.createdAt).toLocaleString()}
                  </p>
                </div>
                {notificationTarget(n) && (
                  <div className="flex items-center gap-1 text-indigo-600 text-xs font-semibold self-center">
                    <span>View</span>
                    <ExternalLink className="w-4 h-4" />
                  </div>
                )}
              </button>
            ))}
          </div>
        )}

        {/* Pagination */}
        {meta && meta.totalPages > 1 && (
          <div className="p-4 border-t border-slate-200 flex items-center justify-between text-sm text-slate-500">
            <span>
              Page {meta.page} of {meta.totalPages} ({meta.totalCount} total)
            </span>
            <div className="space-x-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                Previous
              </button>
              <button
                disabled={page >= meta.totalPages}
                onClick={() => setPage((p) => p + 1)}
                className="px-3 py-1.5 border border-slate-200 rounded-lg disabled:opacity-50 hover:bg-slate-50"
              >
                Next
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
