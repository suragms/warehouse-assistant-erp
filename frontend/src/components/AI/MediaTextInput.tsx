import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';

export function MediaTextInput({ kind, onText, disabled }: { kind: 'ocr' | 'voice'; onText: (text: string) => void; disabled: boolean }) {
  const [open, setOpen] = useState(false), [file, setFile] = useState<File | null>(null), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [text, setText] = useState('');
  const cancellation = useRef<AbortController | null>(null);
  useEffect(() => () => cancellation.current?.abort(), []);
  const capabilities = useQuery({ queryKey: ['media-capabilities'], enabled: open, retry: false,
    queryFn: async ({ signal }) => (await apiClient.get<{ ocr: boolean; voice: boolean; maxBytes: number }>('/ai/media/capabilities', { signal })).data });
  const image = kind === 'ocr', maxText = image ? 20000 : 4000;
  const extract = async () => {
    if (!file || busy || disabled || !consent) return;
    if (file.size > 5 * 1024 * 1024 || !file.size) { setError('Choose a nonempty file up to 5 MiB.'); return; }
    setBusy(true); setError(''); setText('');
    const controller = new AbortController(); cancellation.current = controller;
    try {
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(',')[1]); reader.onerror = () => reject(new Error('Could not read this file.')); reader.readAsDataURL(file);
      });
      if (controller.signal.aborted) return;
      const response = await apiClient.post<{ text: string }>(`/ai/media/${kind}`, { contentBase64, contentType: file.type, confirmExternalProcessing: true }, { signal: controller.signal, timeout: 35000 });
      if (typeof response.data.text !== 'string' || !response.data.text.trim()) throw new Error('No text was returned.');
      if (response.data.text.length > maxText) { setError(`The returned text exceeds ${maxText} characters. Use a shorter recording or smaller image.`); return; }
      setText(response.data.text);
    } catch (e) { if (!controller.signal.aborted) setError(purchaseErrorMessage(e)); }
    finally { if (!controller.signal.aborted) setBusy(false); }
  };
  return <details className="border rounded p-3 my-3" onToggle={e => setOpen(e.currentTarget.open)}><summary className="cursor-pointer font-medium">{image ? 'Read an invoice image' : 'Transcribe a voice recording'}</summary>
    {open && <div className="space-y-3 mt-3">
      <p className="text-sm">{image ? 'PNG or JPEG, up to 5 MiB and 16 megapixels. Sends the image to Gemini.' : 'WAV, WebM, MP3 or M4A, up to 5 MiB. Sends the recording to Groq.'} Review the returned text before using it.</p>
      {capabilities.isPending && <p role="status">Checking availability…</p>}
      {capabilities.isError && <p role="alert">Could not check availability. <button type="button" className="underline" onClick={() => capabilities.refetch()}>Retry</button></p>}
      {capabilities.data && !capabilities.data[kind] && <p role="status">This provider is not configured or is disabled. Enter text manually or ask your administrator to configure it.</p>}
      {capabilities.data?.[kind] && <>
        <label className="block">{image ? 'Invoice image' : 'Voice recording'}<input type="file" className="block w-full py-2" accept={image ? 'image/png,image/jpeg' : 'audio/wav,audio/webm,audio/mpeg,audio/mp4,audio/x-m4a'} disabled={busy || disabled} onChange={e => { setFile(e.target.files?.[0] ?? null); setText(''); setError(''); setConsent(false); }} /></label>
        <label className="flex gap-2"><input type="checkbox" checked={consent} disabled={busy || disabled} onChange={e => setConsent(e.target.checked)} />I approve sending this file to the stated provider for extraction.</label>
        <button type="button" className="border rounded p-3 disabled:opacity-50" disabled={busy || disabled || !file || !consent} onClick={extract}>{busy ? 'Extracting text…' : image ? 'Read image' : 'Transcribe recording'}</button>
      </>}
      {error && <p role="alert" className="text-red-700">{error}</p>}
      {text && <><label className="block">Review extracted text<textarea className="block border rounded p-2 w-full" rows={5} maxLength={maxText} value={text} disabled={disabled || busy} onChange={e => setText(e.target.value)} /></label>
        <button type="button" className="border rounded p-3" disabled={disabled || busy || !text.trim()} onClick={() => { onText(text); setText(''); }}>Use reviewed text</button></>}
    </div>}
  </details>;
}
