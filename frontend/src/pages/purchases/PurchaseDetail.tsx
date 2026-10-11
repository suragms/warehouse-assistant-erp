import { ErrorState } from '../../components/ui';
import { DataTableScroll, RecordCard, RecordFields, ResponsiveRecords } from '../../components/ui/ResponsiveRecords';
import axios from 'axios';
import { ServerDownload } from '../../components/ServerDownload';
import { formatMoney } from '../../lib/formatMoney';
import { WhatsAppDelivery } from '../../components/WhatsAppDelivery';
import PurchasePayment from './PurchasePayment';
import DamageReportSection from '../../components/damage/DamageReportSection';
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useNavigate } from 'react-router-dom';
import { purchaseApi, PurchaseStatus, DeliveryState, type ReceivePurchaseDto, type PurchaseItemDto } from '../../api/purchaseApi';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import { useAuthStore } from '../../stores/authStore';
import { purchaseKeys, stockKeys, catalogKeys, dashboardKeys, reportKeys, notificationKeys } from '../../lib/queryKeys';
import {
  ArrowLeft,
  CheckCircle,
  Truck,
  PackageCheck,
  Building,
  User,
  FileText
} from 'lucide-react';

export default function PurchaseDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const business = useAuthStore(state => state.user?.currentBusiness);
  const can = (permission: string) => business?.role === 'Owner' || business?.role === 'Admin' || business?.role === 'SuperAdmin' || !!business?.permissions.includes(permission);

  const [success, setSuccess] = useState('');
  const [receiveValidation, setReceiveValidation] = useState('');
  const [receiveQuantities, setReceiveQuantities] = useState<Record<string, number>>({});
  const [receiveNotes] = useState<Record<string, string>>({});

  const { data: order, isLoading, error, refetch } = useQuery({
    queryKey: purchaseKeys.detail(id!),
    queryFn: () => purchaseApi.getPurchaseById(id!),
    enabled: !!id,
  });

  const statusMutation = useMutation({
    mutationFn: (status: PurchaseStatus) => purchaseApi.updateStatus(id!, status, order!.version),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      queryClient.invalidateQueries({ queryKey: dashboardKeys.all });
      queryClient.invalidateQueries({ queryKey: reportKeys.all });
    },
  });

  const activity = useQuery({ queryKey: [...purchaseKeys.detail(id!), 'activity'], queryFn: () => purchaseApi.getActivity(id!), enabled: !!order });

  const receiveMutation = useMutation({
    mutationFn: (dto: ReceivePurchaseDto) => purchaseApi.receiveItems(id!, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: purchaseKeys.all });
      for (const key of [stockKeys.all, catalogKeys.all, dashboardKeys.all, reportKeys.all, notificationKeys.all, ['barcode']])
        queryClient.invalidateQueries({ queryKey: key });
      setReceiveQuantities({});
      setSuccess('Received quantities saved.');
    },
  });

  const handleReceiveChange = (itemId: string, qty: number) => {
    setReceiveQuantities(prev => ({ ...prev, [itemId]: qty }));
  };

  const handleFillAllRemaining = () => {
    if (!order) return;
    const filled: Record<string, number> = {};
    order.items.forEach(item => {
      const remaining = Math.max(0, item.orderedQuantity - item.receivedQuantity);
      if (remaining > 0) filled[item.id] = remaining;
    });
    setReceiveQuantities(filled);
  };

  const handleReceiveSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!order || receiveMutation.isPending) return;

    const itemsToReceive = order.items.map(item => {
      const delta = receiveQuantities[item.id] || 0;
      return {
        purchaseItemId: item.id,
        receivedQuantityDelta: delta,
        notes: receiveNotes[item.id] || undefined
      };
    }).filter(i => i.receivedQuantityDelta > 0);

    if (itemsToReceive.length === 0) { setReceiveValidation('Enter a positive received quantity, or fill remaining quantities before saving.'); return; }
    setReceiveValidation('');

    receiveMutation.mutate({ items: itemsToReceive, expectedVersion: order.version });
  };

  if (isLoading) return <div className="p-8 text-center text-slate-500">Loading purchase order details...</div>;
  if (error || !order) return <div className="space-y-4"><button className="underline py-2" onClick={() => navigate('/purchases/list')}>Back to purchases</button><ErrorState message={axios.isAxiosError(error) && error.response?.status === 404 ? 'Purchase order not found.' : 'Purchase details could not be loaded.'} onRetry={() => void refetch()} /></div>;

  const steps = [
    { status: PurchaseStatus.Draft, label: 'Draft' },
    { status: PurchaseStatus.Confirmed, label: 'Confirmed' },
    { status: PurchaseStatus.Dispatched, label: 'Dispatched' },
    { status: PurchaseStatus.Arrived, label: 'Arrived' },
    { status: PurchaseStatus.Verified, label: 'Verified' },
    { status: PurchaseStatus.Completed, label: 'Completed' },
  ];

  const statusName = Object.keys(PurchaseStatus).find(key => PurchaseStatus[key as keyof typeof PurchaseStatus] === order.status);
  const deliveryStateName = Object.keys(DeliveryState).find(key => DeliveryState[key as keyof typeof DeliveryState] === order.deliveryState);

  const canReceive = order.status === PurchaseStatus.Verified && can('purchase.commit') && can('purchase.verify');
  const receiveControl = (item: PurchaseItemDto) => (
    <div className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        aria-label={`Receive quantity for ${item.catalogItemName}`}
        min="0"
        max={Math.max(0, item.orderedQuantity - item.receivedQuantity)}
        step="any"
        placeholder={Math.max(0, item.orderedQuantity - item.receivedQuantity).toString()}
        value={receiveQuantities[item.id] !== undefined ? receiveQuantities[item.id] : ''}
        onChange={(e) => handleReceiveChange(item.id, parseFloat(e.target.value) || 0)}
        disabled={receiveMutation.isPending}
        className="w-28 min-w-0 px-2.5 py-1.5 text-right text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
      />
      {item.orderedQuantity - item.receivedQuantity > 0 && (
        <button
          type="button"
          onClick={() => handleReceiveChange(item.id, item.orderedQuantity - item.receivedQuantity)}
          className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 px-1 py-0.5 rounded hover:bg-indigo-50 transition-colors"
          disabled={receiveMutation.isPending}
          aria-label={`Fill remaining quantity for ${item.catalogItemName}`} title="Fill remaining"
        >
          Max
        </button>
      )}
    </div>
  );

  return (
    <div className="max-w-5xl min-w-0 mx-auto space-y-6 break-words">
      {['Owner', 'Admin', 'SuperAdmin'].includes(business?.role ?? '') && order.status !== PurchaseStatus.Draft && order.status !== PurchaseStatus.Cancelled && <WhatsAppDelivery purchaseId={order.id} />}
      <ServerDownload path="/exports/reports/files/purchases.pdf" filename={`purchase_${order.id}.pdf`} label="Download this purchase PDF" params={{ purchaseId: order.id, start: order.createdAt, end: order.createdAt }} />
      {receiveValidation && <p role="alert" className="text-red-700">{receiveValidation}</p>}
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3">
          <button
            aria-label="Back to purchases" onClick={() => navigate('/purchases')}
            className="shrink-0 p-2 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg border border-slate-200 shadow-sm transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-bold text-slate-900 tracking-tight">{order.orderNumber}</h1>
              <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 uppercase tracking-wide">
                {statusName}
              </span>
            </div>
            <p className="text-sm text-slate-500 mt-0.5">Created on {new Date(order.createdAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {order.status === PurchaseStatus.Draft && can('purchase.edit') && (
            <>
              <button
                onClick={() => navigate(`/purchases/${order.id}/edit`)}
                className="px-4 py-2 bg-white border border-slate-200 text-slate-700 font-medium rounded-lg shadow-sm hover:bg-slate-50 transition-colors"
              >
                Edit Draft
              </button>
              <button
                disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(PurchaseStatus.Confirmed)}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-lg shadow-sm transition-colors"
              >
                <CheckCircle className="w-4 h-4" /> Confirm Order
              </button>
            </>
          )}

          {order.status === PurchaseStatus.Confirmed && can('purchase.delivery') && (
            <button
              disabled={statusMutation.isPending}
                onClick={() => statusMutation.mutate(PurchaseStatus.Dispatched)}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg shadow-sm transition-colors"
            >
              <Truck className="w-4 h-4" /> Mark Dispatched
            </button>
          )}
          {order.status === PurchaseStatus.Dispatched && can('purchase.delivery') && (
            <button disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(PurchaseStatus.Arrived)}
              className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg disabled:opacity-50">Mark Arrived</button>
          )}
          {order.status === PurchaseStatus.Arrived && can('purchase.verify') && (
            <button disabled={statusMutation.isPending} onClick={() => statusMutation.mutate(PurchaseStatus.Verified)}
              className="px-4 py-2 bg-indigo-600 text-white font-medium rounded-lg disabled:opacity-50">Verify Delivery</button>
          )}
        </div>
      </div>

      {(statusMutation.error || receiveMutation.error) && <p role="alert" className="rounded-lg bg-red-50 p-4 text-red-700">{purchaseErrorMessage(statusMutation.error || receiveMutation.error)}</p>}
      {success && <p role="status" className="text-emerald-700">{success}</p>}
      {/* Lifecycle Progress Stepper */}
      <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Lifecycle State</h3>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2 text-center">
          {steps.map((step, idx) => {
            const isPassed = order.status >= step.status && order.status !== PurchaseStatus.Cancelled;
            const isCurrent = order.status === step.status;
            return (
              <div key={step.status} className="flex flex-col items-center">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm mb-2 ${
                  isCurrent ? 'bg-indigo-600 text-white ring-4 ring-indigo-100' :
                  isPassed ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'
                }`}>
                  {idx + 1}
                </div>
                <span className={`text-xs font-medium ${isCurrent ? 'text-indigo-600 font-bold' : 'text-slate-600'}`}>
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {order.verifiedAt && <p className="text-sm text-slate-600">Delivery verified on {new Date(order.verifiedAt).toLocaleString()}.</p>}
      {/* Info Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <Building className="w-4 h-4 text-indigo-600" /> Supplier
          </div>
          <div className="text-base font-semibold text-slate-900">{order.supplierName}</div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <User className="w-4 h-4 text-indigo-600" /> Broker
          </div>
          <div className="text-base font-semibold text-slate-900">{order.brokerName || 'None'}</div>
        </div>

        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 space-y-3">
          <div className="flex items-center gap-2 text-slate-500 text-xs font-semibold uppercase tracking-wider">
            <PackageCheck className="w-4 h-4 text-indigo-600" /> Delivery State
          </div>
          <div className="text-base font-semibold text-slate-900">
            {deliveryStateName}
          </div>
        </div>
      </div>

      {order.notes && (
        <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex items-start gap-3">
          <FileText className="w-5 h-5 text-slate-400 mt-0.5" />
          <div>
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Notes / Terms</h4>
            <p className="text-sm text-slate-700 mt-1">{order.notes}</p>
          </div>
        </div>
      )}

      {/* Line Items & Receiving Section */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
        <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Order Items & Inventory Receipt</h2>
          <span className="text-xs text-slate-500">
            Received quantities update inventory and create stock activity records.
          </span>
        </div>

        <form onSubmit={handleReceiveSubmit}>
          <ResponsiveRecords label="Purchase items and receipts" mobile={
            <div className="p-3 space-y-3">
              {canReceive && order.items.some(i => i.orderedQuantity - i.receivedQuantity > 0) &&
                <button type="button" onClick={handleFillAllRemaining} disabled={receiveMutation.isPending} className="min-h-11 px-3 py-2 rounded-lg border border-indigo-200 text-sm font-medium text-indigo-700">Fill All</button>}
              {order.items.map(item => <RecordCard key={item.id} title={item.catalogItemName} subtitle={item.itemCode}>
                <RecordFields fields={[
                  { label: 'Ordered', value: `${item.orderedQuantity}${item.unit ? ` ${item.unit}` : ''}` },
                  { label: 'Received', value: `${item.receivedQuantity}${item.unit ? ` ${item.unit}` : ''}` },
                  { label: 'Unit price', value: formatMoney(item.unitPrice) },
                  { label: 'Line total', value: <span className="font-semibold">{formatMoney(item.lineTotal)}</span> },
                ]} />
                {canReceive && <div className="mt-3 space-y-2 border-t border-slate-200 pt-3">
                  <p className="text-sm font-medium text-slate-700">Receive now (additional quantity)</p>
                  {receiveControl(item)}
                  <p className="text-xs text-slate-500">Remaining: {Math.max(0, item.orderedQuantity - item.receivedQuantity)} {item.unit}</p>
                </div>}
              </RecordCard>)}
              {order.items.length === 0 && <p className="py-8 text-center text-sm text-slate-500">No order items.</p>}
            </div>
          }>
          <DataTableScroll label="Purchase items and receipt comparison" minWidth={canReceive ? '64rem' : '48rem'}>
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-xs font-semibold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Item Code & Name</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Ordered</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Received</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Unit Price</th>
                  <th className="py-3 px-4 whitespace-nowrap text-right">Line Total</th>
                  {canReceive && (
                    <th className="py-3 px-4 bg-indigo-50/50 text-indigo-900 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <span>Receive Now (Delta)</span>
                        {order.items.some(i => i.orderedQuantity - i.receivedQuantity > 0) && (
                          <button
                            type="button"
                            onClick={handleFillAllRemaining}
                            className="text-[11px] font-semibold text-indigo-600 hover:text-indigo-800 bg-white border border-indigo-200 px-2 py-0.5 rounded shadow-xs transition-colors"
                          >
                            Fill All
                          </button>
                        )}
                      </div>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 text-sm">
                {order.items.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 min-w-56 max-w-80 break-words">
                      <div className="font-semibold text-slate-900">{item.itemCode}</div>
                      <div className="text-xs text-slate-500">{item.catalogItemName}</div>
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-medium text-slate-900">{item.orderedQuantity}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-emerald-600">{item.receivedQuantity}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-right text-slate-700">{formatMoney(item.unitPrice)}</td>
                    <td className="py-3 px-4 whitespace-nowrap text-right font-semibold text-slate-900">{formatMoney(item.lineTotal)}</td>
                    {canReceive && (
                      <td className="py-3 px-4 bg-indigo-50/30 text-right">
                        {receiveControl(item)}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </DataTableScroll>
          </ResponsiveRecords>

          {/* Totals & Submit Receive Action */}
          <div className="p-4 sm:p-6 bg-slate-50 border-t border-slate-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-1 text-sm text-slate-600">
              <div>Subtotal: <span className="font-semibold text-slate-900">{formatMoney(order.subtotal)}</span></div>
              <div>Tax: <span className="font-semibold text-slate-900">{formatMoney(order.taxTotal)}</span></div>
              <div className="text-base font-bold text-slate-900">Grand Total: <span className="text-indigo-600">{formatMoney(order.grandTotal)}</span></div>
            </div>

            {canReceive && (
              <button
                type="submit"
                disabled={receiveMutation.isPending || order.items.every(i => i.receivedQuantity >= i.orderedQuantity)}
                className="max-w-full inline-flex items-center justify-center gap-2 px-4 sm:px-6 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-medium rounded-xl shadow-sm transition-colors disabled:opacity-50"
              >
                <PackageCheck className="w-5 h-5 shrink-0" />
                {order.items.every(i => i.receivedQuantity >= i.orderedQuantity) ? 'All Items Already Received' : 'Commit Received Items to Stock'}
              </button>
            )}
          </div>
        </form>
      </div>

      {/* Damage Reports Section */}
      {order.status >= PurchaseStatus.Arrived && (
        <DamageReportSection
          purchaseOrderId={order.id}
          orderItems={order.items}
        />
      )}

      <PurchasePayment order={order} />
      <section className="bg-white p-5 rounded-xl border border-slate-200 space-y-3" aria-label="Purchase activity">
        <h2 className="font-semibold text-slate-900">Purchase activity</h2>
        {activity.isLoading ? <p className="text-sm text-slate-500">Loading activity…</p> : activity.error ?
          <ErrorState message={purchaseErrorMessage(activity.error)} onRetry={() => void activity.refetch()} /> :
          <ul className="space-y-2 text-sm text-slate-600">{activity.data?.length ? activity.data.map(event =>
            <li key={event.id}>{event.eventType.replace(/^Purchase/, '').replace(/([a-z])([A-Z])/g, '$1 $2')} · {new Date(event.createdAt).toLocaleString()}</li>) :
            <li>No recorded activity yet.</li>}</ul>}
      </section>
    </div>
  );
}
