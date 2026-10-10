import { useRef, useState } from 'react';
import { InvoiceTextHelper } from './InvoiceTextHelper';
import { MediaTextInput } from './MediaTextInput';
import { useMutation } from '@tanstack/react-query';
import { purchaseIntentApi, type PurchaseIntentCandidateDto, type PurchaseIntentItemCandidateDto } from '../../api/purchaseIntentApi';
import { isValidQuantity, MAX_PURCHASE_VALUE, purchaseErrorMessage } from '../../lib/purchaseValidation';
import { Button, Textarea, Card } from '../ui';

interface PurchaseAssistantProps {
  onDraftConfirmed: (items: PurchaseIntentItemCandidateDto[], supplierId?: string, supplierName?: string) => void;
  disabled?: boolean;
}

export const PurchaseAssistant = ({ onDraftConfirmed, disabled = false }: PurchaseAssistantProps) => {
  const [prompt, setPrompt] = useState('');
  const [candidate, setCandidate] = useState<PurchaseIntentCandidateDto | null>(null);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const parse = useMutation({ mutationFn: (text: string) => purchaseIntentApi.parseIntent(text), retry: false });

  const handleParse = async () => {
    if (inFlight.current || disabled || !prompt.trim()) return;
    inFlight.current = true;
    setCandidate(null);
    setError('');
    try {
      const result = await parse.mutateAsync(prompt.trim());
      if (result.status === 'Error') {
        setError(result.message === 'AI_DISABLED' ? 'AI assistance is disabled. You can still enter your purchase manually.' :
          result.message === 'AI_TIMEOUT' ? 'AI analysis timed out. Try again or enter the purchase manually.' :
          'AI could not analyze this request. Try again or enter the purchase manually.');
      } else if (!Array.isArray(result.items) || result.items.some(i => !i || typeof i.requestedQuantity !== 'number')) {
        setError('AI returned an invalid draft. Try again or enter the purchase manually.');
      } else setCandidate(result);
    } catch (e) {
      setError(purchaseErrorMessage(e));
    } finally {
      inFlight.current = false;
    }
  };

  const changeItem = (index: number, changes: Partial<PurchaseIntentItemCandidateDto>) => {
    setCandidate(current => current && ({ ...current, items: current.items.map((item, i) => i === index ? { ...item, ...changes } : item) }));
  };
  const canApply = candidate && candidate.items.length > 0 && candidate.items.every(i => isValidQuantity(i.requestedQuantity));
  const handleApply = () => {
    if (!candidate || !canApply || disabled) return;
    // Only identifiers, labels and quantities cross into the editable form.
    onDraftConfirmed(candidate.items.map(i => ({ catalogItemId: i.isAmbiguous ? undefined : i.catalogItemId,
      catalogItemName: i.catalogItemName, itemCode: i.itemCode, requestedQuantity: i.requestedQuantity,
      unitOfMeasure: i.unitOfMeasure, isAmbiguous: false })), candidate.supplierId, candidate.supplierName);
    setCandidate(null);
    setPrompt('');
  };

  return (
    <Card className="p-4 mb-6 min-w-0 break-words">
      <h2 className="text-xl font-bold mb-2">AI Purchase Helper</h2>
      <p className="text-sm text-slate-600 mb-4">Optional: describe your purchase, review the suggestions, then apply them to the form. Nothing is saved until you create the purchase order.</p>
      <InvoiceTextHelper apply={items => onDraftConfirmed(items)} disabled={disabled || parse.isPending} />
      <MediaTextInput kind="voice" disabled={disabled || parse.isPending} onText={value => { setPrompt(value); setCandidate(null); setError(''); }} />
      <Textarea label="Enter purchase request" value={prompt} maxLength={4000} disabled={parse.isPending || disabled}
        onChange={e => { setPrompt(e.target.value); setCandidate(null); }} placeholder="e.g., Buy 10 units of Rice from Supplier X" />
      <Button type="button" onClick={handleParse} disabled={disabled || !prompt.trim()} className="mt-2" loading={parse.isPending}>
        {parse.isPending ? 'Analyzing…' : 'Analyze Intent'}
      </Button>
      {parse.isPending && <p role="status" className="text-sm mt-2">Analyzing your request…</p>}
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {candidate && (
        <Card className="mt-4 p-3 sm:p-4 min-w-0 border-indigo-200">
          <h3 className="font-bold text-lg mb-2">Review AI suggestions</h3>
          <p className="text-sm text-slate-600 mb-2">Suggestions match the active business catalog. Verify every item and quantity; prices and totals remain your responsibility.</p>
          {candidate.generatedAt && <p className="text-xs text-slate-500 mb-2">Prepared {new Date(candidate.generatedAt).toLocaleString()}</p>}
          <p className="text-sm mb-2">Supplier: {candidate.supplierName || 'Choose a supplier in the purchase form'}</p>
          {candidate.warnings?.map((warning, index) => <p key={index} className="text-sm text-amber-800 mb-2">{warning}</p>)}
          {candidate.items.length === 0 && <p>No items found. Refine your request or enter items manually.</p>}
          <div className="space-y-4">
            {candidate.items.map((item, index) => (
              <div key={index} className="min-w-0 space-y-2 p-3 bg-slate-50 rounded">
                <p className="font-medium">{item.catalogItemName || item.itemCode || `Item ${index + 1}`}</p>
                {item.isAmbiguous && <label className="block text-sm">Choose a matching item
                  <select aria-label={`Resolve item ${index + 1}`} className="block w-full min-w-0 mt-1 p-2 border rounded" value="" disabled={disabled}
                    onChange={e => { const selected = item.options?.find(o => o.catalogItemId === e.target.value);
                      if (selected) changeItem(index, { catalogItemId: selected.catalogItemId, catalogItemName: selected.name, isAmbiguous: false }); }}>
                    <option value="">Choose an option…</option>
                    {item.options?.map(option => <option key={option.catalogItemId} value={option.catalogItemId}>{option.name} — {option.description}</option>)}
                  </select>
                </label>}
                {!item.catalogItemId && <p className="text-sm text-amber-800">{item.isAmbiguous ? 'Ambiguous item: choose an option or resolve it in the form.' : 'Unresolved item: choose a catalog item in the form before creating the purchase.'}</p>}
                <label className="block text-sm" htmlFor={`ai-quantity-${index}`}>Quantity {item.unitOfMeasure ? `(${item.unitOfMeasure})` : ''}</label>
                <input id={`ai-quantity-${index}`} aria-label={`Suggested quantity ${index + 1}`} type="number" min="0.0001" max={MAX_PURCHASE_VALUE} step="0.0001"
                  className="w-full min-w-0 border rounded p-2" disabled={disabled} value={Number.isFinite(item.requestedQuantity) ? item.requestedQuantity : ''}
                  onChange={e => changeItem(index, { requestedQuantity: e.target.valueAsNumber })} />
                {!isValidQuantity(item.requestedQuantity) && <p role="alert" className="text-sm text-red-700">Enter a positive quantity within range, with at most four decimal places.</p>}
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <Button type="button" onClick={handleApply} disabled={disabled || !canApply}>Apply to purchase form</Button>
            <Button type="button" variant="secondary" disabled={disabled} onClick={() => { setCandidate(null); setPrompt(''); }}>Discard</Button>
          </div>
        </Card>
      )}
    </Card>
  );
};
