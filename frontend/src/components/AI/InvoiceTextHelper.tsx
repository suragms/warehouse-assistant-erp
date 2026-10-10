import { useState } from 'react';
import { MediaTextInput } from './MediaTextInput';
import { useMutation } from '@tanstack/react-query';
import apiClient from '../../api/apiClient';
import type { PurchaseIntentItemCandidateDto } from '../../api/purchaseIntentApi';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
type Line = { name: string; quantity: number; unit: string; rate?: number; catalogItemId: string | null };
export function InvoiceTextHelper({ apply, disabled }: { apply: (items: PurchaseIntentItemCandidateDto[]) => void; disabled: boolean }) {
  const [text, setText] = useState(''), [useAi, setUseAi] = useState(false);
  const preview = useMutation({ mutationFn: async () => (await apiClient.post<{ items: Line[]; unparsedLines: number; source: string; message: string }>('/ai/invoice-text', { text, useAi })).data });
  return <details className="border rounded-lg p-3 mt-4 min-w-0"><summary className="cursor-pointer font-medium">Extract pasted invoice text</summary><p className="text-sm my-2">Paste one line per item, such as “Rice 10 kg @ 50”. Review extracted quantities and enter prices in the purchase form.</p>
    <MediaTextInput kind="ocr" disabled={disabled || preview.isPending} onText={value => { setText(value); preview.reset(); }} />
    <label className="block text-sm">Invoice text<textarea className="block border rounded p-2 w-full mt-1" rows={5} maxLength={20000} value={text} disabled={disabled || preview.isPending} onChange={e => { setText(e.target.value); preview.reset(); }} /></label>
    <label className="flex gap-2 py-3 text-sm"><input type="checkbox" checked={useAi} disabled={disabled || preview.isPending} onChange={e => { setUseAi(e.target.checked); preview.reset(); }} />Use the configured AI provider to interpret this text</label>
    <button type="button" disabled={disabled || preview.isPending || !text.trim()} className="border rounded px-3 py-3 disabled:opacity-50" onClick={() => preview.mutate()}>{preview.isPending ? 'Extracting…' : 'Preview invoice lines'}</button>
    {preview.isError && <p role="alert" className="text-red-700">{purchaseErrorMessage(preview.error)}</p>}
    {preview.data && <div className="space-y-3 mt-3"><p role="status" className="text-sm">{preview.data.message}</p><p className="text-sm">Source: {preview.data.source === 'ai_text' ? 'AI text extraction' : 'Local text patterns'} · {preview.data.unparsedLines} lines not extracted</p>
      {!preview.data.items.length && <p>No complete item lines found. Add the quantity, unit and rate, or enter the purchase manually.</p>}
      {preview.data.items.map((line, i) => <p key={i} className="break-words">{line.name}: {line.quantity} {line.unit}{line.rate !== undefined && line.rate !== null ? ` · Suggested rate ${line.rate}` : ''}{!line.catalogItemId && ' · Select item manually'}</p>)}
      {!!preview.data.items.length && <button type="button" className="bg-emerald-800 text-white rounded px-3 py-3" disabled={disabled} onClick={() => { apply(preview.data.items.map(x => ({ catalogItemId: x.catalogItemId ?? undefined, catalogItemName: x.name, requestedQuantity: x.quantity, unitOfMeasure: x.unit, isAmbiguous: false }))); preview.reset(); setText(''); }}>Apply reviewed quantities to form</button>}
    </div>}
  </details>;
}
