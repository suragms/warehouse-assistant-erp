import { ErrorState } from '../../components/ui';
import { formatMoney } from '../../lib/formatMoney';
import { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { purchaseApi, type UpsertPurchaseOrderDto, type PurchasePreviewDto, type UpsertPurchaseItemDto, type PurchaseOrderDto } from '../../api/purchaseApi';
import { supplierApi } from '../../api/supplierApi';
import { brokerApi } from '../../api/brokerApi';
import { catalogApi } from '../../api/catalogApi';
import { purchaseKeys, dashboardKeys, reportKeys } from '../../lib/queryKeys';
import { ShoppingBag, Plus, Trash2, ArrowLeft, Save } from 'lucide-react';
import { PurchaseAssistant } from '../../components/AI/PurchaseAssistant';
import { SupplierPriceSuggestion } from '../../components/SupplierPriceSuggestion';
import { useToast } from '../../components/ui/toastContext';
import { isValidQuantity, MAX_PURCHASE_VALUE, purchaseErrorMessage } from '../../lib/purchaseValidation';
import type { PurchaseIntentItemCandidateDto } from '../../api/purchaseIntentApi';

interface PurchaseFormProps {
  edit?: boolean;
}

export default function PurchaseForm({ edit = false }: PurchaseFormProps) {
  const { id } = useParams<{ id: string }>();
  const orderQuery = useQuery({
    queryKey: purchaseKeys.detail(id!),
    queryFn: () => purchaseApi.getPurchaseById(id!),
    enabled: edit && !!id,
  });

  if (edit && !id) return <p role="alert" className="p-4 text-red-700">A purchase order ID is required to edit a purchase.</p>;
  if (edit && orderQuery.isPending) return <p role="status" className="p-4">Loading purchase order…</p>;
  if (edit && (orderQuery.isError || !orderQuery.data)) return <div role="alert" className="p-4 text-red-700">
    <p>{purchaseErrorMessage(orderQuery.error)}</p><button type="button" className="underline" onClick={() => void orderQuery.refetch()}>Retry</button>
  </div>;

  return <PurchaseFormContent key={id ?? 'new'} edit={edit} id={id} existingOrder={edit ? orderQuery.data : undefined} />;
}

function PurchaseFormContent({ edit, id, existingOrder }: { edit: boolean; id?: string; existingOrder?: PurchaseOrderDto }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const submitting = useRef(false);
  const [orderNumber, setOrderNumber] = useState<string | undefined>();
  const [previewState, setPreview] = useState<{ data: PurchasePreviewDto; snapshot: string } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const errorRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (submitError) { errorRef.current?.focus(); errorRef.current?.scrollIntoView?.({ block: 'center' }); }
  }, [submitError]);
  const [draftLabels, setDraftLabels] = useState<Record<string, string>>({});
  const [draftSupplier, setDraftSupplier] = useState<{ id: string; name: string }>();

  const [loadedVersion] = useState(existingOrder?.version);
  const [supplierId, setSupplierId] = useState(existingOrder?.supplierId ?? '');
  const [brokerId, setBrokerId] = useState(existingOrder?.brokerId || '');
  const [notes, setNotes] = useState(existingOrder?.notes || '');
  const [paymentDays, setPaymentDays] = useState(existingOrder?.paymentDays?.toString() ?? '');
  const [charges, setCharges] = useState<Partial<UpsertPurchaseOrderDto>>(() => existingOrder ? {
    headerDiscountPercent: existingOrder.headerDiscountPercent, freightType: existingOrder.freightType,
    freightAmount: existingOrder.freightAmount, deliveredCharge: existingOrder.deliveredCharge,
    billtyCharge: existingOrder.billtyCharge, commissionMode: existingOrder.commissionMode,
    commissionPercent: existingOrder.commissionPercent, commissionAmount: existingOrder.commissionAmount
  } : { freightType: 'separate', commissionMode: 'percent' });
  const [items, setItems] = useState<UpsertPurchaseItemDto[]>(() => existingOrder?.items.map(i => ({
    catalogItemId: i.catalogItemId, unit: i.unit, freightType: i.freightType, freightAmount: i.freightAmount,
    deliveredCharge: i.deliveredCharge, billtyCharge: i.billtyCharge, orderedQuantity: i.orderedQuantity,
    unitPrice: i.unitPrice ?? 0, discountPercent: i.discountPercent, taxPercent: i.taxPercent,
    kgPerUnit: i.kgPerUnit, landingCostPerKg: i.landingCostPerKg, notes: i.notes || ''
  })) ?? [{ catalogItemId: '', orderedQuantity: 1, unitPrice: 0, notes: '' }]);

  const { data: suppliersData, error: suppliersError, refetch: retrySuppliers } = useQuery({
    queryKey: ['suppliers', 'list'],
    queryFn: () => supplierApi.getSuppliers(1, 100),
  });

  const { data: brokersData, error: brokersError, refetch: retryBrokers } = useQuery({
    queryKey: ['brokers', 'list'],
    queryFn: () => brokerApi.getBrokers(1, 100),
  });

  const { data: catalogData, error: catalogError, refetch: retryCatalog } = useQuery({
    queryKey: ['catalog', 'list'],
    queryFn: () => catalogApi.getItems(1, 200),
  });

  const handleDraftConfirmed = (candidateItems: PurchaseIntentItemCandidateDto[], inferredSupplierId?: string, inferredSupplierName?: string) => {
    if (submitting.current) return;
    setDraftLabels(Object.fromEntries(candidateItems.filter(i => i.catalogItemId).map(i => [i.catalogItemId!, i.catalogItemName || i.itemCode || 'Suggested item'])));
    setDraftSupplier(inferredSupplierId ? { id: inferredSupplierId, name: inferredSupplierName || 'Suggested supplier' } : undefined);
    setItems(candidateItems.map(i => ({
      catalogItemId: i.catalogItemId || '',
      orderedQuantity: i.requestedQuantity,
      unitPrice: 0,
      notes: ''
    })));
    setSupplierId(inferredSupplierId || '');
    setSubmitError('');
  };

  const createMutation = useMutation({
    mutationFn: (dto: UpsertPurchaseOrderDto) => purchaseApi.createPurchase(dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      showToast(edit ? 'Purchase order updated.' : 'Purchase order created.');
      navigate(`/purchases/${res.id}`);
    },
  });

  const updateMutation = useMutation({
    mutationFn: (dto: UpsertPurchaseOrderDto) => purchaseApi.updatePurchase(id!, dto),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
      showToast(edit ? 'Purchase order updated.' : 'Purchase order created.');
      navigate(`/purchases/${res.id}`);
    },
  });


  const handleAddItem = () => {
    setItems([...items, { catalogItemId: '', orderedQuantity: 1, unitPrice: 0, notes: '' }]);
  };

  const handleRemoveItem = (index: number) => {
    if (items.length === 1) return;
    setItems(items.filter((_, i) => i !== index));
  };

  const handleItemChange = (index: number, field: string, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const buildDraftDto = (currentOrderNumber = orderNumber): UpsertPurchaseOrderDto => ({
    ...charges,
    ...(paymentDays !== '' ? { paymentDays: Number(paymentDays) } : {}),
    expectedVersion: edit ? loadedVersion : undefined,
    orderNumber: edit ? existingOrder?.orderNumber : currentOrderNumber,
    supplierId,
    brokerId: brokerId || undefined,
    notes: notes || undefined,
    items: items.map(i => ({
      catalogItemId: i.catalogItemId,
      unit: i.unit ?? catalogData?.data?.find(c => c.id === i.catalogItemId)?.defaultUnit ?? 'PCS', freightType: i.freightType, freightAmount: i.freightAmount, deliveredCharge: i.deliveredCharge, billtyCharge: i.billtyCharge,
      orderedQuantity: Number(i.orderedQuantity),
      unitPrice: Number(i.unitPrice),
      discountPercent: i.discountPercent,
      taxPercent: i.taxPercent,
      kgPerUnit: i.kgPerUnit,
      landingCostPerKg: i.landingCostPerKg,
      notes: i.notes || undefined
    }))
  });
  const currentSnapshot = JSON.stringify(buildDraftDto());
  const preview = previewState?.snapshot === currentSnapshot ? previewState : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    setSubmitError('');
    if (!supplierId) {
      setSubmitError('Please select a supplier.');
      return;
    }
    if (items.length === 0 || items.some(i => !i.catalogItemId || !isValidQuantity(i.orderedQuantity))) {
      setSubmitError('Please ensure all items have a catalog item and valid ordered quantity.');
      return;
    }

    if (items.some(i => !Number.isFinite(i.unitPrice) || i.unitPrice < 0
        || !Number.isFinite(i.discountPercent ?? 0) || (i.discountPercent ?? 0) < 0 || (i.discountPercent ?? 0) > 100
        || !Number.isFinite(i.taxPercent ?? 0) || (i.taxPercent ?? 0) < 0 || (i.taxPercent ?? 0) > 1000)) {
      setSubmitError('Please enter valid prices and tax within the supported range.');
      return;
    }
    // Keep the same unique number after a lost response; retries cannot create a second order.
    const draftOrderNumber = !edit && !orderNumber ? `PO-${crypto.randomUUID()}` : orderNumber;
    if (!edit && !orderNumber) setOrderNumber(draftOrderNumber);
    if (paymentDays !== '' && (!Number.isInteger(Number(paymentDays)) || Number(paymentDays) < 0 || Number(paymentDays) > 3650)) {
      setSubmitError('Payment terms must be between 0 and 3650 days.'); return;
    }
    const dto = buildDraftDto(draftOrderNumber);

    submitting.current = true;
    try {
      const snapshot = JSON.stringify(dto);
      if (!previewState || previewState.snapshot !== snapshot) {
        setPreviewing(true);
        const result = await purchaseApi.previewPurchase(dto);
        setPreview({ data: result, snapshot });
        return;
      }
      dto.previewToken = previewState.data.previewToken;
      if (edit && id) await updateMutation.mutateAsync(dto);
      else await createMutation.mutateAsync(dto);
    } catch (error) {
      setSubmitError(purchaseErrorMessage(error));
    } finally {
      submitting.current = false;
      setPreviewing(false);
    }
  };

  return (
    <div className="max-w-4xl min-w-0 mx-auto space-y-6 break-words">
      {suppliersError && <ErrorState message="Suppliers could not be loaded." onRetry={() => void retrySuppliers()} />}
      {brokersError && <ErrorState message="Brokers could not be loaded." onRetry={() => void retryBrokers()} />}
      {catalogError && <ErrorState message="Catalog items could not be loaded." onRetry={() => void retryCatalog()} />}
      <div className="flex min-w-0 items-start gap-3">
        <button
          aria-label="Back to purchases" onClick={() => navigate(-1)}
          className="shrink-0 p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-slate-200 shadow-sm transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <ShoppingBag className="w-7 h-7 shrink-0 text-indigo-600" />
            {edit ? 'Edit Purchase Order' : 'Create Purchase Order'}
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            {edit ? 'Modify draft order details and line items.' : 'Draft a new purchase order for a supplier.'}
          </p>
        </div>
      </div>

      <PurchaseAssistant onDraftConfirmed={handleDraftConfirmed} disabled={previewing || createMutation.isPending || updateMutation.isPending} />
      {edit && existingOrder && existingOrder.taxTotal > 0 && existingOrder.items.every(i => !i.taxPercent) &&
        <p role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">This order uses a legacy tax amount. Enter verified line tax rates and review the recalculated preview before saving.</p>}

      <form onSubmit={handleSubmit} className="space-y-6">
        {submitError && <p ref={errorRef} tabIndex={-1} role="alert" className="text-sm text-red-700">{submitError}</p>}
        {/* Main Details Card */}
        <div className="bg-white p-4 sm:p-6 min-w-0 rounded-xl shadow-sm border border-slate-200 grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Supplier *</label>
            <select
              aria-label="Supplier"
              required
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="w-full min-w-0 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select Supplier...</option>
              {draftSupplier && !suppliersData?.data?.some(s => s.id === draftSupplier.id) && <option value={draftSupplier.id}>{draftSupplier.name}</option>}
              {suppliersData?.data?.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Broker (Optional)</label>
            <select
              aria-label="Broker" value={brokerId}
              onChange={(e) => setBrokerId(e.target.value)}
              className="w-full min-w-0 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">Select Broker...</option>
              {brokersData?.data?.map(b => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div className="md:col-span-2">
            <label htmlFor="payment-days" className="block text-sm font-medium text-slate-700 mb-1">Payment terms (days)</label>
            <input id="payment-days" type="number" min="0" max="3650" step="1" value={paymentDays} onChange={e => setPaymentDays(e.target.value)}
              className="w-full mb-4 px-3 py-2 rounded-lg border border-slate-300" placeholder="Optional" />
            <label htmlFor="purchase-notes" className="block text-sm font-medium text-slate-700 mb-1">Notes / Terms</label>
            <textarea
              id="purchase-notes" aria-label="Purchase notes" rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Delivery instructions, payment terms, etc."
              className="w-full min-w-0 px-3 py-2 text-sm bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Line Items Card */}
        <div className="bg-white p-4 sm:p-6 min-w-0 rounded-xl shadow-sm border border-slate-200 space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <h2 className="text-lg font-semibold text-slate-900">Purchase Items</h2>
            <button
              type="button"
              onClick={handleAddItem}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-medium text-sm rounded-lg transition-colors"
            >
              <Plus className="w-4 h-4" /> Add Item
            </button>
          </div>

          <div className="space-y-3">
            {items.map((item, index) => (
              <div key={index} className="p-3 sm:p-4 min-w-0 bg-slate-50 border border-slate-200 rounded-xl grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                <div className="md:col-span-5">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Catalog Item *</label>
                  <select
                    aria-label={`Catalog item ${index + 1}`}
                    required
                    value={item.catalogItemId}
                    onChange={(e) => handleItemChange(index, 'catalogItemId', e.target.value)}
                    className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">Select item...</option>
                    {item.catalogItemId && draftLabels[item.catalogItemId] && !catalogData?.data?.some(c => c.id === item.catalogItemId) && <option value={item.catalogItemId}>{draftLabels[item.catalogItemId]}</option>}
                    {catalogData?.data?.map(c => (
                      <option key={c.id} value={c.id}>{c.itemCode} - {c.name}</option>
                    ))}
                  </select>
                </div>


                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Qty *</label>
                  <input
                    type="number"
                    aria-label={`Quantity ${index + 1}`}
                    min="0.0001"
                    max={MAX_PURCHASE_VALUE}
                    step="0.0001"
                    required
                    value={item.orderedQuantity}
                    onChange={(e) => handleItemChange(index, 'orderedQuantity', parseFloat(e.target.value) || 0)}
                    className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Unit landing cost (₹) *</label>
                  <input
                    type="number"
                    aria-label={`Unit price ${index + 1}`}
                    min="0"
                    max={MAX_PURCHASE_VALUE}
                    step="0.0001"
                    required
                    value={item.unitPrice}
                    onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                    className="w-full min-w-0 px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <SupplierPriceSuggestion supplierId={supplierId} itemId={item.catalogItemId} unit={item.unit ?? 'PCS'} onApply={price => handleItemChange(index, 'unitPrice', price)} />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-medium text-slate-600 mb-1">Line Total</label>
                  <div className="px-3 py-2 text-sm font-semibold text-slate-900 bg-white border border-slate-200 rounded-lg">
                    {preview ? formatMoney(preview.data.items[index]?.lineTotal) : 'Preview to view'}
                  </div>
                </div>
                <div className="md:col-span-1 flex justify-end">
                  <button
                    type="button"
                    disabled={items.length === 1}
                    aria-label={`Remove purchase item ${index + 1}`}
                    onClick={() => handleRemoveItem(index)}
                    className="p-2 text-slate-400 hover:text-rose-600 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
                <div className="md:col-span-12 grid sm:grid-cols-3 gap-2">
                  {(['freightAmount', 'deliveredCharge', 'billtyCharge'] as const).map(key => <label className="text-xs" key={key}>{{ freightAmount: 'Line freight (INR)', deliveredCharge: 'Line delivered charge (INR)', billtyCharge: 'Line billty charge (INR)' }[key]}<input type="number" min="0" step="0.01" className="block w-full border rounded p-2" value={item[key] ?? ''} onChange={e => handleItemChange(index, key, e.target.value === '' ? undefined : Number(e.target.value))} /></label>)}
                </div>
                <div className="md:col-span-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="text-xs text-slate-600">Discount (%)
                    <input aria-label={`Discount percent ${index + 1}`} type="number" min="0" max="100" step="0.01"
                      value={item.discountPercent ?? 0} onChange={e => handleItemChange(index, 'discountPercent', Number(e.target.value))}
                      className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 p-2" />
                  </label>
                  <label className="text-xs text-slate-600">Tax (%)
                    <input aria-label={`Tax percent ${index + 1}`} type="number" min="0" max="1000" step="0.01"
                      value={item.taxPercent ?? 0} onChange={e => handleItemChange(index, 'taxPercent', Number(e.target.value))}
                      className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 p-2" />
                  </label>
                </div>

                <details className="md:col-span-12">
                  <summary className="cursor-pointer text-sm text-slate-600">Optional weight pricing</summary>
                  <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="text-xs text-slate-600">Kg per ordered unit
                      <input aria-label={`Kg per unit ${index + 1}`} type="number" min="0.0001" step="0.0001" max={MAX_PURCHASE_VALUE}
                        value={item.kgPerUnit ?? ''} onChange={e => handleItemChange(index, 'kgPerUnit', e.target.value ? Number(e.target.value) : undefined)}
                        className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 p-2" />
                    </label>
                    <label className="text-xs text-slate-600">Manual landing cost per kg (₹)
                      <input aria-label={`Landing cost per kg ${index + 1}`} type="number" min="0.0001" step="0.0001" max={MAX_PURCHASE_VALUE}
                        value={item.landingCostPerKg ?? ''} onChange={e => handleItemChange(index, 'landingCostPerKg', e.target.value ? Number(e.target.value) : undefined)}
                        className="mt-1 block w-full min-w-0 rounded-lg border border-slate-300 p-2" />
                    </label>
                  </div>
                </details>

              </div>
            ))}
          </div>

          {/* Totals Calculation */}
          <div className="pt-4 border-t border-slate-200 flex flex-col items-end space-y-2 text-sm">
            <div className="flex flex-wrap gap-2 justify-between w-full max-w-64">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-medium text-slate-900">{preview ? formatMoney(preview.data.subtotal) : 'Preview to view'}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-between w-full max-w-64 items-center">
              <span className="text-slate-600">Tax Total:</span>
              <span className="font-medium text-slate-900">{preview ? formatMoney(preview.data.taxTotal) : 'Preview to view'}</span>
            </div>
            <div className="flex flex-wrap gap-2 justify-between w-full max-w-64 text-base font-bold pt-2 border-t border-slate-200">
              <span className="text-slate-900">Grand Total:</span>
              <span className="text-indigo-600">{preview ? formatMoney(preview.data.grandTotal) : 'Preview to view'}</span>
            </div>
          </div>
        </div>

      <section className="rounded-xl border bg-white p-4 space-y-4"><h2 className="text-lg font-semibold">Purchase charges</h2><p className="text-sm text-slate-500">The backend applies header discount, freight and commission when you preview. Line charges take precedence over header freight, delivered and billty charges.</p><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {([['headerDiscountPercent', 'Header discount (%)'], ['freightAmount', 'Freight (INR)'], ['deliveredCharge', 'Delivered charge (INR)'], ['billtyCharge', 'Billty charge (INR)'], ['commissionPercent', 'Commission (%)'], ['commissionAmount', 'Flat commission (INR)']] as const).map(([key, label]) => <label key={key} className="text-sm">{label}<input aria-label={label} type="number" min="0" step="0.01" className="block w-full border rounded p-3 mt-1" value={charges[key] ?? ''} onChange={e => setCharges({ ...charges, [key]: e.target.value === '' ? 0 : Number(e.target.value) })} /></label>)}
        <label className="text-sm">Freight type<select className="block w-full border rounded p-3 mt-1" value={charges.freightType ?? 'separate'} onChange={e => setCharges({ ...charges, freightType: e.target.value })}><option value="separate">Separate</option><option value="included">Included</option></select></label>
        <label className="text-sm">Commission mode<select className="block w-full border rounded p-3 mt-1" value={charges.commissionMode ?? 'percent'} onChange={e => setCharges({ ...charges, commissionMode: e.target.value })}>{['percent','flat_invoice','flat_kg','flat_bag','flat_box','flat_tin'].map(mode => <option key={mode} value={mode}>{mode.replaceAll('_', ' ')}</option>)}</select></label>
      </div></section>
        {preview && <div role="status" className="rounded-lg border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
          Review the server preview above. Saving creates a draft; confirm the purchase separately after review.
        </div>}
        {/* Submit Button */}
        <div className="flex flex-wrap justify-end gap-3">
          <button
            type="button"
            aria-label="Back to purchases" onClick={() => navigate(-1)}
            className="px-4 py-2.5 border border-slate-200 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={previewing || createMutation.isPending || updateMutation.isPending}
            className="max-w-full inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors disabled:opacity-50"
          >
            <Save className="w-4 h-4 shrink-0" />
            {previewing ? 'Calculating preview…' : createMutation.isPending || updateMutation.isPending ? 'Saving…' : !preview ? 'Preview Purchase' : edit ? 'Update Purchase Order' : 'Create Purchase Order'}
          </button>
        </div>
      </form>
    </div>
  );
}
