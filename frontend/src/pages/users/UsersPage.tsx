import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { usersApi, type UserDto, type CreateUserDto, type UpdateUserDto } from '../../api/usersApi';
import { userKeys } from '../../lib/queryKeys';
import {
  Plus, Shield, Mail, Ban, Trash2, Edit2, X, AlertCircle, CheckCircle2,
  Copy, Check, Share2, Key, Eye, EyeOff, MessageCircle
} from 'lucide-react';
import { PageHeader } from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import { USER_ROLES, USER_STATUSES } from '../../api/usersApi';
import { PermissionEditor } from '../../components/users/PermissionEditor';

interface CredentialDetails {
  name: string;
  email: string;
  password?: string;
  roleName: string;
  businessName: string;
  loginUrl: string;
  isNewCreation?: boolean;
}

export default function UsersPage() {
  const queryClient = useQueryClient();
  const user = useAuthStore(s => s.user);
  const role = user?.currentBusiness?.role;
  const canManage = (['Owner', 'Admin', 'SuperAdmin', 'Manager'].includes(role ?? '')) && (['Owner', 'SuperAdmin', 'Admin'].includes(role ?? '') || !!user?.currentBusiness?.permissions.includes('users.manage'));
  
  // Admin & SuperAdmin can assign Owner, Admin, Manager, Staff. Owner/Manager can assign Staff only.
  const assignableRoles = (role === 'Admin' || role === 'SuperAdmin')
    ? USER_ROLES.filter(r => r.value >= 1)
    : USER_ROLES.filter(r => r.value === 4);

  const defaultRole = assignableRoles.some(r => r.value === 4) ? 4 : (assignableRoles[0]?.value ?? 4);

  // Admin & SuperAdmin can edit all non-superadmin users. Owner/Manager can only edit Staff (role 4).
  const canEdit = (u: UserDto) => {
    if (!canManage || u.id === user?.id || u.role === 0) return false;
    if (role === 'Admin' || role === 'SuperAdmin') return true;
    return u.role === 4;
  };

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<UserDto | null>(null);
  const [editingPermissions, setEditingPermissions] = useState<UserDto | null>(null);

  // Sharing & Credentials state
  const [sharedCredentials, setSharedCredentials] = useState<CredentialDetails | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  // Form states
  const [formData, setFormData] = useState<CreateUserDto>({
    name: '',
    email: '',
    password: '',
    role: defaultRole,
  });

  const { data: users, isLoading, error } = useQuery({
    queryKey: userKeys.all,
    queryFn: usersApi.getUsers,
  });

  const createMutation = useMutation({
    mutationFn: usersApi.createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      setSharedCredentials({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        roleName: getRoleName(formData.role),
        businessName: user?.currentBusiness?.businessName ?? 'Workspace',
        loginUrl: `${window.location.origin}/login`,
        isNewCreation: true,
      });
      setIsCreateOpen(false);
      setFormData({ name: '', email: '', password: '', role: defaultRole });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateUserDto }) => usersApi.updateUser(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
      setEditingUser(null);
    },
  });

  const blockMutation = useMutation({
    mutationFn: usersApi.blockUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: usersApi.deleteUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userKeys.all });
    },
  });

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(formData);
  };

  const handleUpdateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    updateMutation.mutate({
      id: editingUser.id,
      data: {
        name: editingUser.name,
        email: editingUser.email,
        role: editingUser.role,
        status: editingUser.status,
      },
    });
  };

  const getRoleName = (roleVal: number) => USER_ROLES.find(r => r.value === roleVal)?.label ?? 'Unknown role';
  const mutationError = createMutation.error || updateMutation.error || blockMutation.error || deleteMutation.error;

  const copyText = async (text: string, fieldId?: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        const el = document.createElement('textarea');
        el.value = text;
        document.body.appendChild(el);
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
      }
      if (fieldId) {
        setCopiedField(fieldId);
        setTimeout(() => setCopiedField(null), 2000);
      }
      return true;
    } catch {
      return false;
    }
  };

  const formatCredentialMessage = (creds: CredentialDetails) => {
    const lines = [
      `*Warehouse Assistant - Account Credentials*`,
      `Workspace: ${creds.businessName}`,
      `Name: ${creds.name}`,
      `Email: ${creds.email}`,
    ];
    if (creds.password) {
      lines.push(`Password: ${creds.password}`);
    }
    lines.push(`Role: ${creds.roleName}`);
    lines.push(`Login Portal: ${creds.loginUrl}`);
    if (creds.password) {
      lines.push(`\nNote: Please log in and change your password for safety.`);
    }
    return lines.join('\n');
  };

  const handleShareWhatsApp = (creds: CredentialDetails) => {
    const message = encodeURIComponent(formatCredentialMessage(creds));
    window.open(`https://api.whatsapp.com/send?text=${message}`, '_blank');
  };

  const handleNativeShare = async (creds: CredentialDetails) => {
    const text = formatCredentialMessage(creds);
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${creds.name} - Account Credentials`,
          text,
          url: creds.loginUrl,
        });
      } catch {
        // User cancelled or share failed
      }
    } else {
      await copyText(text, 'all');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <PageHeader
          title="User Management"
          subtitle="Manage workspace users, roles, security policies, and permissions."
        />
        {canManage && <button
          onClick={() => {
            createMutation.reset();
            setFormData({ name: '', email: '', password: '', role: defaultRole });
            setIsCreateOpen(true);
          }}
          className="inline-flex items-center justify-center gap-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white font-medium px-4 py-2 rounded-lg text-sm transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4" />
          Add User
        </button>}
      </div>

      {mutationError && <p role="alert" className="text-red-700 break-words">{purchaseErrorMessage(mutationError)}</p>}
      
      {/* Users table */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        {isLoading ? (
          <div className="p-12 text-center text-slate-500">Loading workspace users...</div>
        ) : error ? (
          <div className="p-12 text-center text-red-500 flex flex-col items-center gap-2">
            <AlertCircle className="w-8 h-8" />
            <p>Failed to load users. Ensure you have proper permissions.</p>
            <button onClick={() => void queryClient.invalidateQueries({ queryKey: userKeys.all })}>Retry</button>
          </div>
        ) : !users || users.length === 0 ? (
          <div className="p-12 text-center text-slate-500">No users found in this workspace.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4">User</th>
                  <th className="py-3 px-4">Role</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4">Created At</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/75 transition-colors">
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-[#0E4F46]/10 text-[#0E4F46] flex items-center justify-center font-bold text-sm">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{u.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400">
                            <Mail className="w-3 h-3 text-slate-400" />
                            <span>{u.email}</span>
                            <button
                              onClick={() => void copyText(u.email, `email-${u.id}`)}
                              className="text-slate-400 hover:text-[#0E4F46] p-0.5 rounded transition-colors inline-flex items-center"
                              title="Copy Email"
                            >
                              {copiedField === `email-${u.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                        <Shield className="w-3 h-3" />
                        {getRoleName(u.role)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      {u.status === 0 ? (
                        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                          <CheckCircle2 className="w-3 h-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs font-semibold px-2.5 py-1 rounded-full">
                          <Ban className="w-3 h-3" /> {USER_STATUSES.find(s => s.value === u.status)?.label ?? "Unavailable"}
                        </span>
                      )}
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 text-xs">
                      {new Date(u.createdAt).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right space-x-1.5">
                      {/* Share / Copy credentials button for every user */}
                      <button
                        onClick={() => {
                          setShowPassword(false);
                          setSharedCredentials({
                            name: u.name,
                            email: u.email,
                            roleName: getRoleName(u.role),
                            businessName: user?.currentBusiness?.businessName ?? 'Workspace',
                            loginUrl: `${window.location.origin}/login`,
                            isNewCreation: false,
                          });
                        }}
                        className="p-1.5 text-slate-500 hover:text-teal-700 hover:bg-teal-50 rounded transition-colors"
                        title="Share / Copy Credentials"
                      >
                        <Share2 className="w-4 h-4" />
                      </button>

                      {canEdit(u) && (
                        <>
                          <button
                            onClick={() => setEditingPermissions(u)}
                            className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 rounded transition-colors"
                            title="Edit Permissions"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { updateMutation.reset(); setEditingUser(u); }}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                            title="Edit User"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            disabled={updateMutation.isPending}
                            onClick={() => updateMutation.mutate({ id: u.id, data: { ...u, status: u.status === 2 ? 0 : 2 } })}
                            className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded transition-colors"
                            title="Block / Unblock User"
                          >
                            <Ban className="w-4 h-4" />
                          </button>
                          <button
                            disabled={deleteMutation.isPending}
                            onClick={() => { if (window.confirm(`Remove ${u.name} from this business?`)) deleteMutation.mutate(u.id); }}
                            className="p-1.5 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                            title="Delete User"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create User Modal */}
      {isCreateOpen && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Add New User</h3>
              <button onClick={() => setIsCreateOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label htmlFor="user-field-1" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Full Name</label>
                <input id="user-field-1"
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label htmlFor="user-field-2" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
                <input id="user-field-2"
                  type="email"
                  required
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]"
                  placeholder="jane@company.com"
                />
              </div>
              <div>
                <label htmlFor="user-field-3" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Password</label>
                <input id="user-field-3"
                  type="password"
                  autoComplete="new-password" minLength={8} maxLength={72}
                  required
                  value={formData.password}
                  onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]"
                  placeholder="••••••••"
                />
              </div>
              <div>
                <label htmlFor="user-field-4" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Role</label>
                <select id="user-field-4"
                  value={formData.role}
                  onChange={(e) => setFormData({ ...formData, role: parseInt(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46] bg-white"
                >
                  {assignableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="px-4 py-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {createMutation.isPending ? 'Creating...' : 'Create User'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit User Modal */}
      {editingUser && canManage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-lg font-bold text-slate-900">Edit User</h3>
              <button onClick={() => setEditingUser(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleUpdateSubmit} className="space-y-4">
              <div>
                <label htmlFor="user-field-5" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Full Name</label>
                <input id="user-field-5"
                  type="text"
                  required
                  value={editingUser.name}
                  onChange={(e) => setEditingUser({ ...editingUser, name: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]"
                />
              </div>
              <div>
                <label htmlFor="user-field-6" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Email Address</label>
                <input id="user-field-6"
                  type="email"
                  required
                  value={editingUser.email}
                  onChange={(e) => setEditingUser({ ...editingUser, email: e.target.value })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]"
                />
              </div>
              <div>
                <label htmlFor="user-field-7" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Role</label>
                <select id="user-field-7"
                  value={editingUser.role}
                  onChange={(e) => setEditingUser({ ...editingUser, role: parseInt(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46] bg-white"
                >
                  {assignableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="user-field-8" className="block text-xs font-semibold text-slate-600 uppercase mb-1">Status</label>
                <select id="user-field-8"
                  value={editingUser.status}
                  onChange={(e) => setEditingUser({ ...editingUser, status: parseInt(e.target.value) })}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46] bg-white"
                >
                  <option value={0}>Active</option>
                  <option value={1}>Inactive</option>
                  <option value={2}>Blocked</option>
                </select>
              </div>
              <div className="flex justify-end gap-3 pt-4 border-t">
                <button
                  type="button"
                  onClick={() => setEditingUser(null)}
                  className="px-4 py-2 border border-slate-200 rounded-lg text-sm text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updateMutation.isPending}
                  className="px-4 py-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Copy / Share Credentials Modal */}
      {sharedCredentials && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${sharedCredentials.isNewCreation ? 'bg-emerald-100 text-[#0E4F46]' : 'bg-teal-100 text-teal-800'}`}>
                  {sharedCredentials.isNewCreation ? <CheckCircle2 className="w-6 h-6" /> : <Key className="w-6 h-6" />}
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    {sharedCredentials.isNewCreation ? 'User Created Successfully!' : 'Share Login Credentials'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    {sharedCredentials.isNewCreation
                      ? 'Credentials are ready. Copy or share them securely.'
                      : 'Copy or share account details with the user.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSharedCredentials(null)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Credential Details Card */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Workspace</span>
                <span className="font-semibold text-slate-800">{sharedCredentials.businessName}</span>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Full Name</span>
                <span className="font-semibold text-slate-800">{sharedCredentials.name}</span>
              </div>

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Email Address</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-800 font-medium">{sharedCredentials.email}</span>
                  <button
                    onClick={() => void copyText(sharedCredentials.email, 'cred-email')}
                    className="p-1 text-slate-400 hover:text-[#0E4F46] rounded transition-colors"
                    title="Copy Email"
                  >
                    {copiedField === 'cred-email' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>

              {sharedCredentials.password && (
                <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                  <span className="text-slate-500 font-medium">Password</span>
                  <div className="flex items-center gap-1.5">
                    <span className="font-mono bg-white px-2 py-0.5 rounded border border-slate-200 font-semibold text-slate-900">
                      {showPassword ? sharedCredentials.password : '••••••••••••'}
                    </span>
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="p-1 text-slate-400 hover:text-slate-700 rounded transition-colors"
                      title={showPassword ? "Hide Password" : "Show Password"}
                    >
                      {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={() => void copyText(sharedCredentials.password!, 'cred-pass')}
                      className="p-1 text-slate-400 hover:text-[#0E4F46] rounded transition-colors"
                      title="Copy Password"
                    >
                      {copiedField === 'cred-pass' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center text-xs pb-2 border-b border-slate-200">
                <span className="text-slate-500 font-medium">Assigned Role</span>
                <span className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 font-semibold px-2 py-0.5 rounded-full">
                  <Shield className="w-3 h-3" />
                  {sharedCredentials.roleName}
                </span>
              </div>

              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500 font-medium">Login URL</span>
                <div className="flex items-center gap-1.5">
                  <span className="font-mono text-slate-600 truncate max-w-[180px]">{sharedCredentials.loginUrl}</span>
                  <button
                    onClick={() => void copyText(sharedCredentials.loginUrl, 'cred-url')}
                    className="p-1 text-slate-400 hover:text-[#0E4F46] rounded transition-colors"
                    title="Copy Portal URL"
                  >
                    {copiedField === 'cred-url' ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Quick Share Action Buttons */}
            <div className="space-y-2">
              <button
                onClick={() => void copyText(formatCredentialMessage(sharedCredentials), 'all')}
                className="w-full flex items-center justify-center gap-2 bg-[#0E4F46] hover:bg-[#0E4F46]/90 text-white font-medium py-2.5 px-4 rounded-xl text-sm transition-all shadow-sm"
              >
                {copiedField === 'all' ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-300" />
                    <span>Credentials Copied to Clipboard!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copy Full Credentials</span>
                  </>
                )}
              </button>

              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleShareWhatsApp(sharedCredentials)}
                  className="flex items-center justify-center gap-2 bg-[#25D366] hover:bg-[#20ba5a] text-white font-medium py-2 px-3 rounded-xl text-xs transition-colors shadow-sm"
                >
                  <MessageCircle className="w-4 h-4" />
                  <span>Share WhatsApp</span>
                </button>

                <button
                  type="button"
                  onClick={() => void handleNativeShare(sharedCredentials)}
                  className="flex items-center justify-center gap-2 border border-slate-200 hover:bg-slate-50 text-slate-700 font-medium py-2 px-3 rounded-xl text-xs transition-colors"
                >
                  <Share2 className="w-4 h-4" />
                  <span>Share to App</span>
                </button>
              </div>
            </div>

            <div className="pt-2 text-center">
              <button
                type="button"
                onClick={() => setSharedCredentials(null)}
                className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Permissions Editor */}
      {editingPermissions && (
        <PermissionEditor
          userId={editingPermissions.id}
          userName={editingPermissions.name}
          onClose={() => setEditingPermissions(null)}
        />
      )}
    </div>
  );
}
