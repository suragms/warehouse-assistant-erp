import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
import { purchaseErrorMessage } from '../lib/purchaseValidation';

export function AccountSecurity() {
  const [current, setCurrent] = useState(''); const [next, setNext] = useState(''); const [confirm, setConfirm] = useState(''); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const cache = useQueryClient(); const navigate = useNavigate();
  async function finish(path: string, data?: unknown) {
    if (busy) return; setBusy(true); setError('');
    try { await apiClient.post(path, data); cache.clear(); useAuthStore.getState().logout(); navigate('/login', { replace: true }); }
    catch (e) { setError(purchaseErrorMessage(e)); } finally { setBusy(false); }
  }
  return <section className="rounded-xl border bg-white p-4 space-y-4 min-w-0"><h2 className="text-lg font-semibold">Password and sessions</h2><p className="text-sm">Changing your password signs you out on every device.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); if (next !== confirm) { setError('New passwords do not match.'); return; } void finish('/settings/password', { currentPassword: current, newPassword: next }); }}><fieldset disabled={busy} className="space-y-3">
      <label className="block text-sm">Current password<input className="block border rounded p-2 w-full mt-1" type="password" autoComplete="current-password" required value={current} onChange={e => setCurrent(e.target.value)} /></label>
      <label className="block text-sm">New password<input className="block border rounded p-2 w-full mt-1" type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={next} onChange={e => setNext(e.target.value)} /></label>
      <label className="block text-sm">Confirm new password<input className="block border rounded p-2 w-full mt-1" type="password" autoComplete="new-password" required value={confirm} onChange={e => setConfirm(e.target.value)} /></label>
      <button className="bg-emerald-800 text-white rounded px-4 py-3">Change password</button></fieldset></form>
    <button className="border rounded px-4 py-3" disabled={busy} onClick={() => void finish('/auth/logout-all')}>Sign out on all devices</button>{error && <p role="alert">{error}</p>}
  </section>;
}
