import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import apiClient from '../../api/apiClient';
import { BrandLogo } from '../../components/BrandIdentity';
import { isAxiosError } from 'axios';

export default function PasswordRecovery({ reset = false }: { reset?: boolean }) {
  const [link] = useState(() => new URLSearchParams(window.location.hash.slice(1)));
  const [email, setEmail] = useState(reset ? link.get('email') ?? '' : '');
  const [token] = useState(link.get('token') ?? '');
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [error, setError] = useState('');
  useEffect(() => { if (reset) window.history.replaceState(null, '', window.location.pathname); }, [reset]);
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); if (busy) return; setError('');
    if (reset && (password !== confirm || password.length < 8 || new TextEncoder().encode(password).length > 72)) {
      setError('Passwords must match and contain at least 8 characters and at most 72 UTF-8 bytes.'); return;
    }
    setBusy(true);
    try {
      const response = await apiClient.post(reset ? '/auth/reset-password' : '/auth/forgot-password', reset ? { email, token, newPassword: password } : { email });
      setMessage(response.data.message); setPassword(''); setConfirm('');
    } catch (e) {
      const status = isAxiosError(e) ? e.response?.status : undefined;
      const code = isAxiosError(e) ? e.response?.data?.error?.code : undefined;
      setError(code === 'PASSWORD_RESET_UNAVAILABLE' ? 'Password reset is not configured. Contact your business owner for help.'
        : code === 'INVALID_RESET_TOKEN' ? 'This reset link is invalid or expired. Request another link.'
        : status === 429 ? 'Too many requests. Wait a moment before trying again.'
        : status === 400 ? 'Check your email and password. Use at least 8 characters and at most 72 UTF-8 bytes.'
        : 'Recovery is temporarily unavailable. Try again later.');
    } finally { setBusy(false); }
  };
  const field = 'block w-full border rounded p-3 mt-1';
  return <main className="min-h-screen bg-slate-50 flex items-center justify-center p-4"><section className="bg-white border rounded-xl p-6 w-full max-w-md space-y-4">
    <BrandLogo /><h1 className="text-xl font-semibold">{reset ? 'Choose a new password' : 'Reset your password'}</h1>
    <p className="text-sm">{reset ? 'Changing your password signs out your existing sessions on all devices.' : 'Enter your account email. If recovery is enabled and the account is eligible, instructions will be queued.'}</p>
    {message ? <p role="status">{message}</p> : reset && !token ? <p role="alert">This reset link is missing or has expired. Request a new link.</p> : <form className="space-y-4" onSubmit={submit}>
      <label className="block">Email<input className={field} type="email" autoComplete="email" required maxLength={255} value={email} disabled={busy} onChange={e => setEmail(e.target.value)} /></label>
      {reset && <><label className="block">New password<input className={field} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={password} disabled={busy} onChange={e => setPassword(e.target.value)} /></label>
        <label className="block">Confirm new password<input className={field} type="password" autoComplete="new-password" required minLength={8} maxLength={72} value={confirm} disabled={busy} onChange={e => setConfirm(e.target.value)} /></label></>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      <button className="bg-emerald-900 text-white rounded p-3 w-full disabled:opacity-50" disabled={busy}>{busy ? 'Please wait…' : reset ? 'Change password' : 'Request reset instructions'}</button>
    </form>}
    <nav className="flex flex-wrap gap-4"><Link className="underline py-2" to="/login">Back to sign in</Link>{reset && <Link className="underline py-2" to="/forgot-password">Request another link</Link>}</nav>
  </section></main>;
}
