import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PaymentState, PurchaseStatus, purchaseApi, type PurchaseOrderDto } from '../../api/purchaseApi';
import { useAuthStore } from '../../stores/authStore';
import { formatMoney } from '../../lib/formatMoney';
import { purchaseErrorMessage, MAX_PURCHASE_VALUE } from '../../lib/purchaseValidation';
import { purchaseKeys, dashboardKeys, reportKeys } from '../../lib/queryKeys';
import { Button, Input } from '../../components/ui';

export default function PurchasePayment({ order }: { order: PurchaseOrderDto }) {
  const owner = useAuthStore(s => ['Owner', 'Admin', 'SuperAdmin'].includes(s.user?.currentBusiness?.role ?? ''));
  const client = useQueryClient(); const busy = useRef(false);
  const [open, setOpen] = useState(false); const [amount, setAmount] = useState('');
  const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  const payment = useMutation({
    mutationFn: (paidAmount: number) => purchaseApi.updatePayment(order.id, paidAmount, order.version),
    onSuccess: () => {
      setOpen(false); setSuccess('Payment total recorded.'); setError('');
      for (const queryKey of [purchaseKeys.all, dashboardKeys.all, reportKeys.all]) void client.invalidateQueries({ queryKey });
    },
    onError: err => setError(purchaseErrorMessage(err)),
    onSettled: () => { busy.current = false; }
  });
  const state = Object.keys(PaymentState).find(key => PaymentState[key as keyof typeof PaymentState] === order.paymentState) || 'Pending';
  return <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4" aria-labelledby="payment-heading">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 id="payment-heading" className="text-lg font-semibold">Payment</h2><span className="text-sm">{state.replace('DueSoon', 'Due soon')}</span>
    </div>
    <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-sm">
      <div><dt className="text-slate-500">Paid to date</dt><dd>{formatMoney(owner ? order.paidAmount : undefined)}</dd></div>
      <div><dt className="text-slate-500">Remaining</dt><dd>{formatMoney(owner ? order.remainingAmount : undefined)}</dd></div>
      <div><dt className="text-slate-500">Due date</dt><dd>{order.dueDate || 'No payment terms'}</dd></div>
    </dl>
    {success && <p role="status" className="text-sm text-green-700">{success}</p>}
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    {owner && order.status !== PurchaseStatus.Draft && order.status !== PurchaseStatus.Cancelled && (!open
      ? <Button variant="secondary" onClick={() => { setAmount(String(order.paidAmount ?? 0)); setOpen(true); setSuccess(''); setError(''); }}>Record Payment</Button>
      : <form className="space-y-4" onSubmit={event => {
        event.preventDefault(); if (busy.current) return;
        const value = Number(amount);
        if (!amount.trim() || !Number.isFinite(value) || value < 0 || value > MAX_PURCHASE_VALUE || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.0001) {
          setError('Enter a nonnegative paid total with at most four decimal places.'); return;
        }
        busy.current = true; setError(''); payment.mutate(value);
      }}>
        <Input label="Total paid to date" type="number" min="0" max={MAX_PURCHASE_VALUE} step="0.0001" required value={amount} disabled={payment.isPending}
          onChange={e => setAmount(e.target.value)} hint="Enter the cumulative amount, including earlier payments. The server caps it at the invoice total." />
        <div className="flex flex-wrap gap-2"><Button type="submit" loading={payment.isPending}>Save Payment Total</Button>
          <Button type="button" variant="ghost" disabled={payment.isPending} onClick={() => { setOpen(false); setError(''); }}>Cancel</Button></div>
      </form>)}
  </section>;
}
