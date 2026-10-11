import { DialogFrame } from '../ui/DialogFrame';
import React, { useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, ALL_PERMISSIONS } from '../../api/usersApi';
import { ShieldCheck, Shield, AlertCircle, Save, X } from 'lucide-react';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import { cn } from '../../lib/cn';

interface PermissionEditorProps {
  userId: string;
  userName: string;
  onClose: () => void;
}

export const PermissionEditor: React.FC<PermissionEditorProps> = ({ userId, userName, onClose }) => {
  const queryClient = useQueryClient();
  const [granted, setGranted] = React.useState<Set<string>>(new Set());
  const [revoked, setRevoked] = React.useState<Set<string>>(new Set());

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ['users', userId, 'permissions'],
    queryFn: () => usersApi.getPermissions(userId),
    staleTime: 0,
  });

  const updateMutation = useMutation({
    mutationFn: (vars: { grant: string[], revoke: string[] }) => usersApi.patchPermissions(userId, vars),
    onSuccess: () => {
      setGranted(new Set());
      setRevoked(new Set());
      queryClient.invalidateQueries({ queryKey: ['users', userId, 'permissions'] });
      // Invalidate the auth query in case we're editing ourselves and our permissions changed
      queryClient.invalidateQueries({ queryKey: ['auth'] });
    },
  });

  // Send changes relative to the loaded effective permissions, including existing overrides.
  const togglePermission = (key: string, currentlyEnabled: boolean) => {
    const enabled = !currentlyEnabled, baseEnabled = data?.permissions.includes(key) ?? false;
    setGranted(previous => { const next = new Set(previous); if (enabled && !baseEnabled) next.add(key); else next.delete(key); return next; });
    setRevoked(previous => { const next = new Set(previous); if (!enabled && baseEnabled) next.add(key); else next.delete(key); return next; });
  };

  const handleSave = () => {
    updateMutation.mutate({
      grant: Array.from(granted),
      revoke: Array.from(revoked),
    });
  };

  // Group permissions
  const groupedPermissions = useMemo(() => {
    const groups = new Map<string, typeof ALL_PERMISSIONS>();
    ALL_PERMISSIONS.forEach(p => {
      if (!groups.has(p.group)) groups.set(p.group, []);
      groups.get(p.group)!.push(p);
    });
    return groups;
  }, []);

  const hasChanges = granted.size > 0 || revoked.size > 0;

  const close = () => { if (!updateMutation.isPending && (!hasChanges || window.confirm('Discard changes?'))) onClose(); };

  return (
    <DialogFrame open title="Manage Permissions" onClose={close} busy={updateMutation.isPending} className="max-w-2xl">
      <div className="bg-white rounded-xl shadow-xl max-w-2xl w-full p-6 max-h-[90dvh] flex flex-col">
        <div className="flex items-center justify-between border-b pb-3 shrink-0">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Manage Permissions</h3>
            <p className="text-sm text-slate-500">Editing permissions for <span className="font-medium text-slate-800">{userName}</span></p>
          </div>
          <button aria-label="Close permissions" onClick={close} disabled={updateMutation.isPending} className="text-slate-400 hover:text-slate-600 rounded-lg p-2 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error ? (
          <div className="flex bg-red-50 p-4 rounded-lg my-4 text-red-700 items-start">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold" role="alert">Failed to load permissions</p><button className="underline py-2" onClick={() => void refetch()}>Retry permissions</button>
              <p className="text-sm mt-1">{purchaseErrorMessage(error)}</p>
            </div>
          </div>
        ) : updateMutation.isSuccess && !hasChanges ? (
          <div className="flex bg-emerald-50 p-4 rounded-lg my-4 text-emerald-700 items-center justify-between shrink-0">
            <div className="flex items-center">
              <ShieldCheck className="w-5 h-5 mr-3 shrink-0" />
              <p className="font-medium">Permissions saved successfully.</p>
            </div>
          </div>
        ) : updateMutation.isError ? (
           <div className="flex bg-red-50 p-4 rounded-lg my-4 text-red-700 items-start shrink-0">
            <AlertCircle className="w-5 h-5 mr-3 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">Failed to save changes</p>
              <p className="text-sm mt-1">{purchaseErrorMessage(updateMutation.error)}</p>
            </div>
          </div>
        ) : (
          <div className="my-4 shrink-0 flex gap-4 text-xs font-medium px-2">
            <div className="flex items-center gap-1.5 text-slate-600">
               <span className="w-3 h-3 rounded bg-slate-200 border border-slate-300"></span> Default
            </div>
            <div className="flex items-center gap-1.5 text-emerald-700">
               <span className="w-3 h-3 rounded bg-emerald-100 border border-emerald-300 ring-1 ring-emerald-500 ring-offset-1"></span> Granted explicitly
            </div>
            <div className="flex items-center gap-1.5 text-red-700">
               <span className="w-3 h-3 rounded bg-red-50 border border-red-200"></span> Revoked explicitly
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto min-h-0 pr-2 space-y-6 pb-2">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <div className="animate-spin h-6 w-6 border-2 border-[#0E4F46] border-t-transparent rounded-full" />
            </div>
          ) : data ? (
            Array.from(groupedPermissions.entries()).map(([groupName, perms]) => (
              <div key={groupName} className="space-y-3">
                <h4 className="font-semibold text-slate-800 text-sm border-b pb-1 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-[#159A8A]" />
                  {groupName}
                </h4>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {perms.map(p => {
                    const isDefault = data.defaultPermissions.includes(p.key);
                    const isBaseEnabled = data.permissions.includes(p.key);
                    const isCurrentlyEnabled = (isBaseEnabled && !revoked.has(p.key)) || granted.has(p.key);

                    const isExplicitlyGranted = granted.has(p.key) || (isBaseEnabled && !isDefault && !revoked.has(p.key));
                    const isExplicitlyRevoked = revoked.has(p.key) || (!isBaseEnabled && isDefault && !granted.has(p.key));

                    return (
                      <button type="button" role="switch" aria-checked={isCurrentlyEnabled} aria-label={p.label} disabled={updateMutation.isPending}
                        key={p.key}
                        className={cn(
                          "flex flex-col text-left p-2.5 rounded-lg border cursor-pointer select-none transition-all disabled:cursor-wait",
                          isCurrentlyEnabled
                            ? isExplicitlyGranted
                              ? "bg-emerald-50 border-emerald-200 ring-1 ring-emerald-500"
                              : "bg-slate-50 border-slate-200 hover:border-slate-300"
                            : isExplicitlyRevoked
                              ? "bg-red-50 border-red-100"
                              : "bg-white border-slate-200 hover:bg-slate-50"
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          togglePermission(p.key, isCurrentlyEnabled);
                        }}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span className={cn(
                            "text-sm font-medium",
                            isCurrentlyEnabled ? "text-slate-900" : "text-slate-600"
                          )}>
                            {p.label}
                          </span>

                          <div className={cn(
                            "w-8 h-4 rounded-full relative transition-colors border",
                            isCurrentlyEnabled
                              ? isExplicitlyGranted ? "bg-emerald-500 border-emerald-600" : "bg-[#159A8A] border-[#0E4F46]"
                              : "bg-slate-200 border-slate-300"
                          )}>
                            <div className={cn(
                              "w-3 h-3 bg-white rounded-full absolute top-[1px] transition-all shadow-sm",
                              isCurrentlyEnabled ? "left-[14px]" : "left-[1px]"
                            )} />
                          </div>
                        </div>
                        <span className="text-[10px] text-slate-400 font-mono mt-1">{p.key}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          ) : null}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t shrink-0">
          <button
            type="button"
            onClick={close} disabled={updateMutation.isPending}
            className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
          >
            {hasChanges ? 'Cancel' : 'Close'}
          </button>

          <button
            disabled={updateMutation.isPending || (!hasChanges && !updateMutation.isSuccess)}
            onClick={handleSave}
            className={cn(
              "px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2",
              hasChanges
                ? "bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white"
                : updateMutation.isSuccess
                  ? "bg-emerald-600 text-white"
                  : "bg-slate-100 text-slate-400 cursor-not-allowed"
            )}
          >
            {updateMutation.isPending ? (
              <>Saving...</>
            ) : updateMutation.isSuccess && !hasChanges ? (
              <><ShieldCheck className="w-4 h-4" /> Saved</>
            ) : (
              <><Save className="w-4 h-4" /> Save changes</>
            )}
          </button>
        </div>
      </div>
    </DialogFrame>
  );
};
