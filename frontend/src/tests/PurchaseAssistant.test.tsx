import { act, fireEvent, render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import PurchaseForm from '../pages/purchases/PurchaseForm';
import { ToastProvider } from '../components/ui/ToastProvider';
import { purchaseIntentApi, type PurchaseIntentCandidateDto } from '../api/purchaseIntentApi';
import { purchaseKeys } from '../lib/queryKeys';
import { purchaseApi } from '../api/purchaseApi';
import { supplierApi } from '../api/supplierApi';
import { brokerApi } from '../api/brokerApi';
import { catalogApi } from '../api/catalogApi';

vi.mock('../api/purchaseIntentApi', () => ({ purchaseIntentApi: { parseIntent: vi.fn() } }));
vi.mock('../api/purchaseApi', () => ({ purchaseApi: { createPurchase: vi.fn(), updatePurchase: vi.fn(), previewPurchase: vi.fn(), getPurchaseById: vi.fn() } }));
vi.mock('../api/supplierApi', () => ({ supplierApi: { getSuppliers: vi.fn() } }));
vi.mock('../api/brokerApi', () => ({ brokerApi: { getBrokers: vi.fn() } }));
vi.mock('../api/catalogApi', () => ({ catalogApi: { getItems: vi.fn() } }));

const draft = (): PurchaseIntentCandidateDto => ({ status: 'Success', supplierId: 's1', supplierName: 'Supplier A',
  items: [{ catalogItemId: 'c1', catalogItemName: 'Rice', requestedQuantity: 2.5, isAmbiguous: false }] });
const deferred = <T,>() => { let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; };
const renderForm = (edit = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(<QueryClientProvider client={client}><ToastProvider><MemoryRouter initialEntries={[edit ? '/purchases/p1/edit' : '/new']}><Routes>
    <Route path="/new" element={<PurchaseForm />} /><Route path="/purchases/:id/edit" element={<PurchaseForm edit />} /><Route path="/purchases/:id" element={<p>Purchase detail</p>} />
  </Routes></MemoryRouter></ToastProvider></QueryClientProvider>);
  return { invalidate, client };
};
const analyze = async () => {
  fireEvent.change(screen.getByLabelText('Enter purchase request'), { target: { value: 'Buy 2.5 Rice from Supplier A' } });
  fireEvent.click(screen.getByRole('button', { name: 'Analyze Intent' }));
  await screen.findByText('Review AI suggestions');
};
const apply = () => fireEvent.click(screen.getByRole('button', { name: 'Apply to purchase form' }));
const submit = () => fireEvent.submit(screen.getByRole('button', { name: /^(Preview Purchase|Create Purchase Order)$/ }).closest('form')!);
const review = async () => { submit(); await screen.findByRole('button', { name: 'Create Purchase Order' }); expect(purchaseApi.createPurchase).not.toHaveBeenCalled(); };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(supplierApi.getSuppliers).mockResolvedValue({ data: [{ id: 's1', name: 'Supplier A', isActive: true }], meta: { page: 1, pageSize: 1, totalCount: 1, totalPages: 1 } });
  vi.mocked(brokerApi.getBrokers).mockResolvedValue({ data: [], meta: { page: 1, pageSize: 0, totalCount: 0, totalPages: 0 } });
  vi.mocked(catalogApi.getItems).mockResolvedValue({ data: [{ id: 'c1', itemCode: 'R1', name: 'Rice' }, { id: 'c2', itemCode: 'R2', name: 'Brown Rice' }] } as never);
  vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(draft());
  vi.mocked(purchaseApi.previewPurchase).mockImplementation(async dto => ({ subtotal: 777, taxTotal: 0, grandTotal: 777,
    items: dto.items.map(i => ({ ...i, lineTotal: 777 })), previewToken: 'test-preview' } as never));
  vi.mocked(purchaseApi.createPurchase).mockResolvedValue({ id: 'p1' } as never);
});

describe('Purchase assistant and authoritative submit', () => {
  it('submits human-entered payment terms through the reviewed purchase payload', async () => {
    renderForm(); await analyze(); apply();
    fireEvent.change(screen.getByLabelText('Payment terms (days)'), { target: { value: '30' } });
    await review(); submit(); await screen.findByText('Purchase detail');
    expect(vi.mocked(purchaseApi.createPurchase).mock.calls[0][0].paymentDays).toBe(30);
  });
  it('submits reviewed tax and discount rates and displays only server-calculated tax', async () => {
    vi.mocked(purchaseApi.previewPurchase).mockImplementation(async dto => ({ subtotal: 777, taxTotal: 321, grandTotal: 1098,
      items: dto.items.map(i => ({ ...i, lineTotal: 1098 })), previewToken: 'test-preview' } as never));
    renderForm(); await analyze(); apply();
    fireEvent.change(screen.getByLabelText('Discount percent 1'), { target: { value: '10' } });
    fireEvent.change(screen.getByLabelText('Tax percent 1'), { target: { value: '5' } });
    await review(); expect(screen.getByText('₹321.00')).toBeInTheDocument();
    submit(); await screen.findByText('Purchase detail');
    const body = vi.mocked(purchaseApi.createPurchase).mock.calls[0][0];
    expect(body).not.toHaveProperty('taxTotal'); expect(body.items[0].discountPercent).toBe(10); expect(body.items[0].taxPercent).toBe(5);
  });
  it.each([['Tax percent 1', '-1'], ['Discount percent 1', '101']])('rejects invalid %s without preview or purchase writes', async (label, value) => {
    renderForm(); await analyze(); apply(); fireEvent.change(screen.getByLabelText(label), { target: { value } }); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('valid prices and tax');
    expect(purchaseApi.previewPurchase).not.toHaveBeenCalled(); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it('renders server totals without saving and invalidates preview after an edit', async () => {
    renderForm(); await analyze(); apply();
    await review();
    expect(screen.getAllByText('₹777.00').length).toBeGreaterThan(0);
    expect(purchaseApi.previewPurchase).toHaveBeenCalledTimes(1);
    expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Quantity 1'), { target: { value: '9' } });
    expect(screen.getByRole('button', { name: 'Preview Purchase' })).toBeInTheDocument();
    expect(screen.queryByText('₹777.00')).not.toBeInTheDocument();
    await review(); expect(purchaseApi.previewPurchase).toHaveBeenCalledTimes(2);
    submit(); await screen.findByText('Purchase detail');
    expect(vi.mocked(purchaseApi.createPurchase).mock.calls[0][0].previewToken).toBe('test-preview');
  });
  it('prevents duplicate preview requests and keeps failed previews unsaved', async () => {
    const pending = deferred<never>(); vi.mocked(purchaseApi.previewPurchase).mockReturnValue(pending.promise);
    renderForm(); await analyze(); apply(); submit();
    const form = screen.getByRole('button', { name: 'Calculating preview…' }).closest('form')!;
    fireEvent.submit(form); expect(purchaseApi.previewPurchase).toHaveBeenCalledTimes(1);
    await act(async () => pending.reject({ isAxiosError: true, response: { status: 400, data: { error: 'Choose a supplier in the current business.' } } }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Choose a supplier');
    expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it('renders optional assistant and accepts a prompt', () => {
    renderForm(); expect(screen.getByText('AI Purchase Helper')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Analyze Intent' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Enter purchase request'), { target: { value: 'Buy rice' } });
    expect(screen.getByLabelText('Enter purchase request')).toHaveValue('Buy rice');
  });
  it('sends one parse request, displays loading, and prevents duplicate clicks', async () => {
    const pending = deferred<PurchaseIntentCandidateDto>(); vi.mocked(purchaseIntentApi.parseIntent).mockReturnValue(pending.promise);
    renderForm(); fireEvent.change(screen.getByLabelText('Enter purchase request'), { target: { value: 'Buy rice' } });
    const button = screen.getByRole('button', { name: 'Analyze Intent' });
    fireEvent.click(button); fireEvent.click(button);
    expect(await screen.findByText('Analyzing your request…')).toBeInTheDocument(); expect(button).toBeDisabled();
    expect(purchaseIntentApi.parseIntent).toHaveBeenCalledExactlyOnceWith('Buy rice');
    await act(async () => pending.resolve(draft()));
  });
  it('shows validated supplier and items without creating or invalidating purchases', async () => {
    const { invalidate } = renderForm(); await analyze();
    expect(screen.getByText('Supplier: Supplier A')).toBeInTheDocument(); expect(screen.getByText('Rice', { selector: 'p' })).toBeInTheDocument();
    expect(purchaseApi.createPurchase).not.toHaveBeenCalled(); expect(invalidate).not.toHaveBeenCalled();
  });
  it('resolves ambiguous options only after the user chooses', async () => {
    const candidate = draft(); candidate.items[0] = { requestedQuantity: 2, catalogItemName: 'Rice', isAmbiguous: true,
      options: [{ catalogItemId: 'c1', name: 'Rice' }, { catalogItemId: 'c2', name: 'Brown Rice' }] };
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(candidate); renderForm(); await analyze();
    expect(screen.getByLabelText('Resolve item 1')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Resolve item 1'), { target: { value: 'c2' } }); apply();
    expect(screen.getByLabelText('Catalog item 1')).toHaveValue('c2'); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it('requires unresolved items to be resolved in the form before submit', async () => {
    const candidate = draft(); candidate.items[0].catalogItemId = undefined;
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(candidate); renderForm(); await analyze();
    expect(screen.getByText(/Unresolved item:/)).toBeInTheDocument(); apply(); submit();
    expect(await screen.findByRole('alert')).toHaveTextContent('valid ordered quantity'); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it('does not reuse a previous supplier when the AI supplier is unresolved', async () => {
    const candidate = draft(); candidate.supplierId = undefined; candidate.supplierName = undefined;
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(candidate); renderForm();
    await screen.findByRole('option', { name: 'Supplier A' });
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 's1' } }); await analyze(); apply(); submit();
    expect(screen.getByLabelText('Supplier')).toHaveValue(''); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it('allows quantity and financial review then uses only the existing purchase API on explicit submit', async () => {
    renderForm(); await analyze(); fireEvent.change(screen.getByLabelText('Suggested quantity 1'), { target: { value: '3.25' } }); apply();
    expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText('Unit price 1'), { target: { value: '4' } }); await review(); submit();
    expect(await screen.findByText('Purchase detail')).toBeInTheDocument();
    expect(screen.getByText('Purchase order created.')).toBeInTheDocument();
    expect(purchaseApi.createPurchase).toHaveBeenCalledWith({ previewToken: 'test-preview', expectedVersion: undefined, orderNumber: expect.stringMatching(/^PO-/), supplierId: 's1', brokerId: undefined,
      notes: undefined, freightType: 'separate', commissionMode: 'percent', items: [{ catalogItemId: 'c1', orderedQuantity: 3.25, unitPrice: 4,
        unit: 'PCS', freightType: undefined, freightAmount: undefined, deliveredCharge: undefined, billtyCharge: undefined,
        discountPercent: undefined, taxPercent: undefined, kgPerUnit: undefined, landingCostPerKg: undefined, notes: undefined }] });
  });
  it('drops AI financial, tenant, and lifecycle fields', async () => {
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue({ ...draft(), businessId: 'foreign', taxTotal: 9000, status: 'Success', paymentState: 2,
      items: [{ ...draft().items[0], unitPrice: 500, lineTotal: 1000 }] } as unknown as PurchaseIntentCandidateDto);
    renderForm(); await analyze(); apply(); await review(); submit(); await screen.findByText('Purchase detail');
    const body = vi.mocked(purchaseApi.createPurchase).mock.calls[0][0];
    expect(body).not.toHaveProperty('businessId'); expect(body).not.toHaveProperty('paymentState');
    expect(body).not.toHaveProperty('taxTotal'); expect(body.items[0].unitPrice).toBe(0); expect(body.items[0]).not.toHaveProperty('lineTotal');
  });
  it('discards a draft without modifying or creating a purchase', async () => {
    renderForm(); await analyze(); fireEvent.click(screen.getByRole('button', { name: 'Discard' }));
    expect(screen.queryByText('Review AI suggestions')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Catalog item 1')).toHaveValue(''); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it.each([0, -1, 1e15, 0.00001])('blocks invalid suggested quantity %s', async quantity => {
    const candidate = draft(); candidate.items[0].requestedQuantity = quantity;
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(candidate); renderForm(); await analyze();
    expect(screen.getByRole('button', { name: 'Apply to purchase form' })).toBeDisabled();
  });
  it.each([401, 403, 409, 429, 500, 503, undefined])('shows a safe parse error for HTTP %s', async status => {
    vi.mocked(purchaseIntentApi.parseIntent).mockRejectedValue({ isAxiosError: true, response: { status, data: { error: 'secret-stack-trace' } } });
    renderForm(); fireEvent.change(screen.getByLabelText('Enter purchase request'), { target: { value: 'Buy rice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Intent' }));
    expect(await screen.findByRole('alert')).not.toHaveTextContent('secret-stack-trace'); expect(purchaseApi.createPurchase).not.toHaveBeenCalled();
  });
  it.each(['AI_DISABLED', 'AI_TIMEOUT', 'INVALID_AI_RESPONSE', 'AI_UNAVAILABLE'])('handles %s and keeps manual purchase working', async message => {
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue({ status: 'Error', message, items: [] }); renderForm();
    fireEvent.change(screen.getByLabelText('Enter purchase request'), { target: { value: 'Buy rice' } });
    fireEvent.click(screen.getByRole('button', { name: 'Analyze Intent' })); await screen.findByRole('alert');
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Catalog item 1'), { target: { value: 'c1' } }); await review(); submit();
    await screen.findByText('Purchase detail'); expect(purchaseApi.createPurchase).toHaveBeenCalledTimes(1);
  });
  it('prevents duplicate purchase submits while pending and shows success only after the response', async () => {
    const pending = deferred<never>(); vi.mocked(purchaseApi.createPurchase).mockReturnValue(pending.promise);
    const { invalidate } = renderForm(); await analyze(); apply(); await review();
    const form = screen.getByRole('button', { name: 'Create Purchase Order' }).closest('form')!;
    fireEvent.submit(form); fireEvent.submit(form);
    expect(await screen.findByRole('button', { name: 'Saving…' })).toBeDisabled();
    expect(purchaseApi.createPurchase).toHaveBeenCalledTimes(1); expect(invalidate).not.toHaveBeenCalled();
    expect(screen.queryByText('Purchase order created.')).not.toBeInTheDocument();
    await act(async () => pending.resolve({ id: 'p1' } as never)); await screen.findByText('Purchase detail'); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['purchases'] }); expect(invalidate).toHaveBeenCalledWith({ queryKey: ['dashboard'] });
  });
  it('retries a failed purchase with the same order number without false success', async () => {
    vi.mocked(purchaseApi.createPurchase).mockRejectedValueOnce({ isAxiosError: true }).mockResolvedValueOnce({ id: 'p1' } as never);
    const { invalidate } = renderForm(); await analyze(); apply(); await review(); submit();
    await screen.findByRole('alert'); expect(invalidate).not.toHaveBeenCalled(); expect(screen.queryByText('Purchase order created.')).not.toBeInTheDocument();
    submit(); await screen.findByText('Purchase detail');
    expect(vi.mocked(purchaseApi.createPurchase).mock.calls[0][0].orderNumber).toBe(vi.mocked(purchaseApi.createPurchase).mock.calls[1][0].orderNumber);
  });
  it('creates a purchase manually without any AI request', async () => {
    renderForm(); await screen.findByRole('option', { name: 'Supplier A' });
    fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: 's1' } });
    fireEvent.change(screen.getByLabelText('Catalog item 1'), { target: { value: 'c1' } }); await review(); submit(); await screen.findByText('Purchase detail');
    expect(purchaseIntentApi.parseIntent).not.toHaveBeenCalled();
  });
  it('keeps validated choices visible when outside the initial catalog page', async () => {
    const candidate = draft(); candidate.items[0].catalogItemId = 'c300'; candidate.items[0].catalogItemName = 'Other item';
    vi.mocked(purchaseIntentApi.parseIntent).mockResolvedValue(candidate); renderForm(); await analyze(); apply();
    expect(screen.getByLabelText('Catalog item 1')).toHaveValue('c300'); expect(screen.getByRole('option', { name: 'Other item' })).toBeInTheDocument();
  });
});

it('preserves a draft and uses the original edit version after a background refresh', async () => {
  const order = { id: 'p1', version: 7, status: 0, supplierId: 's1', orderNumber: 'PO-1', notes: 'Initial note', items: [{ catalogItemId: 'c1', orderedQuantity: 2, receivedQuantity: 0, unitPrice: 5, unit: 'KG' }] };
  vi.mocked(purchaseApi.getPurchaseById).mockResolvedValue(order as never); const { client } = renderForm(true);
  const notes = await screen.findByLabelText('Purchase notes'); fireEvent.change(notes, { target: { value: 'My draft note' } });
  await act(async () => { client.setQueryData(purchaseKeys.detail('p1'), { ...order, version: 8, notes: 'Concurrent change' }); });
  expect(notes).toHaveValue('My draft note'); fireEvent.submit(notes.closest('form')!);
  await screen.findByRole('button', { name: 'Update Purchase Order' }); expect(purchaseApi.previewPurchase).toHaveBeenCalledWith(expect.objectContaining({ expectedVersion: 7, notes: 'My draft note' }));
});
