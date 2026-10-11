import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { purchaseErrorMessage } from '../lib/purchaseValidation';

interface Policy { enabled: boolean; providerOrder: string[]; models: Record<string, string>; timeoutSeconds: number; retries: number; version: string }
export function AiProviderSettings() {
  const query = useQuery({ queryKey: ['settings', 'ai'], queryFn: async () => {
    const value = (await apiClient.get<Policy>('/settings/ai')).data;
    if (!value || !Array.isArray(value.providerOrder) || !value.models || typeof value.enabled !== 'boolean') throw new Error('Invalid AI routing response.');
    return value;
  } });
  const [draft, setDraft] = useState<Policy | null>(null); const [notice, setNotice] = useState('');
  const save = useMutation({ mutationFn: async (policy: Policy) => (await apiClient.put<Policy>('/settings/ai', policy)).data, onSuccess: () => { setDraft(null); setNotice('AI routing saved.'); void query.refetch(); } });
  const value = draft ?? query.data;
  return <section className="rounded-xl border bg-white p-4 space-y-4 min-w-0"><h2 className="text-lg font-semibold">AI provider routing</h2>
    {query.isPending && <p role="status">Loading AI routing…</p>}{query.isError && <p role="alert">AI routing could not be loaded. <button onClick={() => void query.refetch()}>Retry</button></p>}
    {value && <form className="space-y-3" onSubmit={e => { e.preventDefault(); setNotice(''); save.mutate(value); }}><fieldset disabled={save.isPending} className="space-y-3">
      <label className="flex gap-2"><input className="shrink-0" type="checkbox" checked={value.enabled} onChange={e => setDraft({ ...value, enabled: e.target.checked })} />Enable purchase AI for this business</label>
      <label className="block text-sm">Provider order (comma separated)<input className="block border rounded p-2 w-full mt-1" value={value.providerOrder.join(', ')} onChange={e => setDraft({ ...value, providerOrder: e.target.value.split(',').map(x => x.trim()) })} /></label>
      <p className="text-sm">Use OpenRouter, Gemini, Groq or OpenAI. Only listed providers are used, in that order. Missing credentials are skipped.</p>
      <div className="grid sm:grid-cols-2 gap-3 min-w-0">{['OpenRouter', 'Gemini', 'Groq', 'OpenAI'].map(provider => <label className="text-sm min-w-0" key={provider}>{provider} model (optional)<input className="block border rounded p-2 w-full mt-1" value={value.models[provider] ?? ''} maxLength={128} onChange={e => { const models = { ...value.models }; if (e.target.value) models[provider] = e.target.value; else delete models[provider]; setDraft({ ...value, models }); }} /></label>)}</div>
      <div className="grid sm:grid-cols-2 gap-3 min-w-0"><label className="block min-w-0">Timeout per attempt (seconds)<input className="block border rounded p-2 w-full mt-1" type="number" min={1} max={20} value={value.timeoutSeconds} onChange={e => setDraft({ ...value, timeoutSeconds: Number(e.target.value) })} /></label><label className="block min-w-0">Retry count<input className="block border rounded p-2 w-full mt-1" type="number" min={0} max={1} value={value.retries} onChange={e => setDraft({ ...value, retries: Number(e.target.value) })} /></label></div>
      <p className="text-sm">The complete request has a 45-second deadline. Three failed requests pause a provider for 60 seconds. Model availability requires a configured provider account.</p><button className="bg-emerald-800 text-white rounded px-4 py-3">Save AI routing</button>
    </fieldset></form>}{save.isError && <p role="alert">{purchaseErrorMessage(save.error)}</p>}{notice && <p role="status">{notice}</p>}
  </section>;
}
