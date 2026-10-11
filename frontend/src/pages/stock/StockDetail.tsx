import { ErrorState } from '../../components/ui';
import { useAuthStore } from '../../stores/authStore';
import { hasPermission } from '../../auth/hasPermission';
import React, { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, TrendingUp, ClipboardList, RefreshCw, Clock } from 'lucide-react';
import { stockApi } from '../../api/stockApi';
import type { AdjustStockRequest, UpdatePhysicalStockRequest, ReconcileStockRequest } from '../../api/stockApi';
import { catalogKeys, dashboardKeys, reportKeys, stockKeys } from '../../lib/queryKeys';
import { useToast } from '../../components/ui/toastContext';
import axios from 'axios';

export default function StockDetail() {
  const { id } = useParams<{ id: string }>();
  const user = useAuthStore(s => s.user);
  const qc = useQueryClient();
  const { showToast } = useToast();
  const [activeForm, setActiveForm] = useState<'adjust' | 'physical' | 'reconcile' | null>(null);

  const { data: item, isLoading, error, refetch } = useQuery({
    queryKey: stockKeys.detail(id!),
    queryFn: () => stockApi.getDetail(id!),
    enabled: !!id,
  });

  const invalidate = () => {
    for (const key of [catalogKeys.all, dashboardKeys.all, reportKeys.all, ['barcode']]) void qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: stockKeys.detail(id!) });
    qc.invalidateQueries({ queryKey: stockKeys.lists() });
    qc.invalidateQueries({ queryKey: stockKeys.lowStock() });
    qc.invalidateQueries({ queryKey: stockKeys.outOfStock() });
    qc.invalidateQueries({ queryKey: stockKeys.activity(id!) });
  };

  const handleConflict = (err: unknown) => {
    if (axios.isAxiosError(err) && err.response?.status === 409) {
      const code = typeof err.response?.data?.error === 'string' ? err.response.data.error : err.response?.data?.error?.code;
      if (code === 'STOCK_VERSION_CONFLICT') {
        showToast('Stock was updated by another session. Reloading latest data…', 'error');
        qc.invalidateQueries({ queryKey: stockKeys.detail(id!) });
      } else if (code === 'INSUFFICIENT_STOCK') {
        showToast('Insufficient available stock for this operation.', 'error');
      } else if (code === 'RECONCILE_NO_VARIANCE') {
        showToast('No variance to reconcile — system and physical stock already match.', 'error');
      } else {
        showToast('Operation failed. Please try again.', 'error');
      }
    } else {
      showToast('An unexpected error occurred.', 'error');
    }
  };

  const adjustMutation = useMutation({
    mutationFn: (req: AdjustStockRequest) => stockApi.adjustStock(id!, req),
    onSuccess: () => { invalidate(); setActiveForm(null); showToast('Stock adjusted successfully.', 'success'); },
    onError: handleConflict,
  });

  const physicalMutation = useMutation({
    mutationFn: (req: UpdatePhysicalStockRequest) => stockApi.updatePhysicalStock(id!, req),
    onSuccess: () => { invalidate(); setActiveForm(null); showToast('Physical count recorded.', 'success'); },
    onError: handleConflict,
  });

  const reconcileMutation = useMutation({
    mutationFn: (req: ReconcileStockRequest) => stockApi.reconcileStock(id!, req),
    onSuccess: () => { invalidate(); setActiveForm(null); showToast('Stock reconciled successfully.', 'success'); },
    onError: handleConflict,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-24">
        <span className="animate-spin h-8 w-8 border-2 border-[#0E4F46] border-t-transparent rounded-full" />
      </div>
    );
  }

  if (error) return <ErrorState message={axios.isAxiosError(error) && error.response?.status === 404 ? 'Item not found.' : 'Stock details could not be loaded.'} onRetry={() => void refetch()} />;
  if (!item) {
    return (
      <div className="text-center py-16 text-gray-400">
        <p>Item not found.</p>
        <Link to="/inventory" className="text-[#0E4F46] hover:underline mt-2 inline-block text-sm">
          ← Back to Inventory
        </Link>
      </div>
    );
  }

  const isOutOfStock = item.availableStock <= 0;
  const isLow = !isOutOfStock && item.availableStock <= item.reorderLevel;
  const variance = item.physicalStock - item.systemStock;

  return (
    <div className="space-y-6 min-w-0 max-w-3xl break-words">
      {/* Header */}
      <div>
        <Link
          to="/inventory"
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-[#0E4F46] mb-3"
        >
          <ArrowLeft className="h-4 w-4" /> Inventory
        </Link>
        <div className="flex items-start justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-bold text-[#0E4F46]">{item.name}</h1>
            <p className="text-sm text-gray-400 mt-0.5">{item.itemCode}{item.barcode ? ` · ${item.barcode}` : ''} · {item.categoryName}</p>
          </div>
          <Link
            to={`/inventory/${id}/activity`}
            className="flex items-center gap-1.5 text-sm text-[#0E4F46] border border-[#0E4F46] px-3 py-1.5 rounded-lg hover:bg-[#0E4F46] hover:text-white transition-colors"
          >
            <Clock className="h-4 w-4" /> Activity Log
          </Link>
        </div>
      </div>

      {/* Stock summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        <StatCard label="System Stock" value={item.systemStock} unit={item.defaultUnit} />
        <StatCard label="Physical Stock" value={item.physicalStock} unit={item.defaultUnit} />
        <StatCard label="Reserved" value={item.reservedStock} unit={item.defaultUnit} />
        <StatCard
          label="Available"
          value={item.availableStock}
          unit={item.defaultUnit}
          highlight={isOutOfStock ? 'danger' : isLow ? 'warn' : 'ok'}
        />
      </div>

      {/* Variance notice */}
      {variance !== 0 && (
        <div className={`flex items-start gap-3 p-4 rounded-xl border ${variance < 0 ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
          <span className={`text-sm font-medium ${variance < 0 ? 'text-red-700' : 'text-amber-700'}`}>
            Variance detected: physical is {variance > 0 ? '+' : ''}{variance} {item.defaultUnit} vs system stock.
            {' '}Use "Reconcile" to sync.
          </span>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-wrap gap-3">
        {hasPermission(user, 'stock.adjust') && <ActionButton
          active={activeForm === 'adjust'}
          onClick={() => setActiveForm(activeForm === 'adjust' ? null : 'adjust')}
          icon={<TrendingUp className="h-4 w-4" />}
          label="Adjust Stock"
          color="blue"
        />}
        {hasPermission(user, 'stock.physical') && <ActionButton
          active={activeForm === 'physical'}
          onClick={() => setActiveForm(activeForm === 'physical' ? null : 'physical')}
          icon={<ClipboardList className="h-4 w-4" />}
          label="Record Physical Count"
          color="teal"
        />}
        {hasPermission(user, 'stock.system') && <ActionButton
          active={activeForm === 'reconcile'}
          onClick={() => setActiveForm(activeForm === 'reconcile' ? null : 'reconcile')}
          icon={<RefreshCw className="h-4 w-4" />}
          label="Reconcile"
          color="amber"
          disabled={variance === 0}
          title={variance === 0 ? 'No variance to reconcile' : undefined}
        />}
      </div>

      {/* Forms */}
      {activeForm === 'adjust' && hasPermission(user, 'stock.adjust') && (
        <AdjustForm
          unit={item.defaultUnit}
          availableStock={item.availableStock}
          rowVersion={item.rowVersion}
          onSubmit={req => adjustMutation.mutate(req)}
          isPending={adjustMutation.isPending}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {activeForm === 'physical' && hasPermission(user, 'stock.physical') && (
        <PhysicalForm
          unit={item.defaultUnit}
          currentPhysical={item.physicalStock}
          rowVersion={item.rowVersion}
          onSubmit={req => physicalMutation.mutate(req)}
          isPending={physicalMutation.isPending}
          onCancel={() => setActiveForm(null)}
        />
      )}
      {activeForm === 'reconcile' && hasPermission(user, 'stock.system') && (
        <ReconcileForm
          unit={item.defaultUnit}
          systemStock={item.systemStock}
          physicalStock={item.physicalStock}
          variance={variance}
          rowVersion={item.rowVersion}
          onSubmit={req => reconcileMutation.mutate(req)}
          isPending={reconcileMutation.isPending}
          onCancel={() => setActiveForm(null)}
        />
      )}
    </div>
  );
}

/* ── Sub-components ── */

function StatCard({
  label, value, unit, highlight,
}: {
  label: string;
  value: number;
  unit: string;
  highlight?: 'ok' | 'warn' | 'danger';
}) {
  const textColor =
    highlight === 'danger' ? 'text-red-600' :
    highlight === 'warn' ? 'text-amber-600' :
    'text-[#0E4F46]';
  return (
    <div className="bg-white min-w-0 border border-gray-200 rounded-xl p-3 sm:p-4">
      <p className="text-xs text-gray-500 mb-1">{label}</p>
      <p className={`text-2xl break-words font-bold ${textColor}`}>{value}</p>
      <p className="text-xs text-gray-400">{unit}</p>
    </div>
  );
}

function ActionButton({
  active, onClick, icon, label, color, disabled, title,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  color: 'blue' | 'teal' | 'amber';
  disabled?: boolean;
  title?: string;
}) {
  const base = 'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium border transition-colors';
  const colors = {
    blue: active ? 'bg-blue-600 text-white border-blue-600' : 'text-blue-700 border-blue-300 hover:bg-blue-50',
    teal: active ? 'bg-[#0E4F46] text-white border-[#0E4F46]' : 'text-[#0E4F46] border-[#0E4F46]/40 hover:bg-[#0E4F46]/5',
    amber: active ? 'bg-amber-600 text-white border-amber-600' : 'text-amber-700 border-amber-300 hover:bg-amber-50',
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`${base} ${colors[color]} disabled:opacity-40 disabled:cursor-not-allowed`}
    >
      {icon} {label}
    </button>
  );
}

function FormCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white min-w-0 border border-gray-200 rounded-xl p-4 sm:p-5 space-y-4">
      <h3 className="font-semibold text-gray-800">{title}</h3>
      {children}
    </div>
  );
}

function FormField({
  label, children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-sm text-gray-600 mb-1">{label}</span>
      {children}
    </label>
  );
}

const inputCls = 'w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#0E4F46]/20 focus:border-[#0E4F46]';

function AdjustForm({
  unit, availableStock, rowVersion, onSubmit, isPending, onCancel,
}: {
  unit: string;
  availableStock: number;
  rowVersion: string;
  onSubmit: (req: AdjustStockRequest) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [delta, setDelta] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const parsed = parseFloat(delta);
  const valid = !isNaN(parsed) && parsed !== 0 && (availableStock + parsed) >= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ quantityDelta: parsed, reason: reason || undefined, notes: notes || undefined, expectedVersion: rowVersion });
  };

  return (
    <FormCard title="Adjust System Stock">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={`Quantity Delta (positive to add, negative to remove) — available: ${availableStock} ${unit}`}>
          <input
            aria-label="Quantity delta" type="number"
            step="any"
            value={delta}
            onChange={e => setDelta(e.target.value)}
            className={inputCls}
            placeholder="e.g. 10 or -5"
            required
          />
        </FormField>
        <FormField label="Reason">
          <input aria-label="Reason" type="text" value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Required" required maxLength={500} />
        </FormField>
        <FormField label="Notes">
          <textarea aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={2} maxLength={2000} placeholder="Optional" />
        </FormField>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!valid || isPending}
            className="px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Confirm Adjustment'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </FormCard>
  );
}

function PhysicalForm({
  unit, currentPhysical, rowVersion, onSubmit, isPending, onCancel,
}: {
  unit: string;
  currentPhysical: number;
  rowVersion: string;
  onSubmit: (req: UpdatePhysicalStockRequest) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [physical, setPhysical] = useState(String(currentPhysical));
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const parsed = parseFloat(physical);
  const valid = !isNaN(parsed) && parsed >= 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid) return;
    onSubmit({ physicalStock: parsed, reason: reason || undefined, notes: notes || undefined, expectedVersion: rowVersion });
  };

  return (
    <FormCard title="Record Physical Count">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={`Counted Quantity (${unit})`}>
          <input
            aria-label="Physical stock count" type="number"
            step="any"
            min="0"
            value={physical}
            onChange={e => setPhysical(e.target.value)}
            className={inputCls}
            required
          />
        </FormField>
        <FormField label="Reason">
          <input aria-label="Reason" type="text" value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Optional" maxLength={500} />
        </FormField>
        <FormField label="Notes">
          <textarea aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={2} maxLength={2000} placeholder="Optional" />
        </FormField>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={!valid || isPending}
            className="px-4 py-2 bg-[#0E4F46] text-white text-sm rounded-lg hover:bg-[#0a3d36] disabled:opacity-40"
          >
            {isPending ? 'Saving…' : 'Record Count'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </FormCard>
  );
}

function ReconcileForm({
  unit, systemStock, physicalStock, variance, rowVersion, onSubmit, isPending, onCancel,
}: {
  unit: string;
  systemStock: number;
  physicalStock: number;
  variance: number;
  rowVersion: string;
  onSubmit: (req: ReconcileStockRequest) => void;
  isPending: boolean;
  onCancel: () => void;
}) {
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit({ reason: reason || undefined, notes: notes || undefined, expectedVersion: rowVersion });
  };

  return (
    <FormCard title="Reconcile Stock">
      <div className="bg-gray-50 rounded-lg p-3 text-sm space-y-1">
        <p>System stock: <strong>{systemStock} {unit}</strong></p>
        <p>Physical stock: <strong>{physicalStock} {unit}</strong></p>
        <p className={variance < 0 ? 'text-red-600 font-medium' : 'text-amber-700 font-medium'}>
          Applying delta: {variance > 0 ? '+' : ''}{variance} {unit}
        </p>
      </div>
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Reason">
          <input aria-label="Reason" type="text" value={reason} onChange={e => setReason(e.target.value)} className={inputCls} placeholder="Optional" maxLength={500} />
        </FormField>
        <FormField label="Notes">
          <textarea aria-label="Notes" value={notes} onChange={e => setNotes(e.target.value)} className={inputCls} rows={2} maxLength={2000} placeholder="Optional" />
        </FormField>
        <div className="flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={isPending}
            className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 disabled:opacity-40"
          >
            {isPending ? 'Reconciling…' : 'Confirm Reconciliation'}
          </button>
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm border rounded-lg hover:bg-gray-50">
            Cancel
          </button>
        </div>
      </form>
    </FormCard>
  );
}
