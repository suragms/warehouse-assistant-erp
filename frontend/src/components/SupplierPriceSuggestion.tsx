import { useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { useAuthStore } from '../stores/authStore';
import { formatMoney } from '../lib/formatMoney';

export function SupplierPriceSuggestion({ supplierId, itemId, unit, onApply }: { supplierId: string; itemId: string; unit: string; onApply: (price: number) => void }) {
  const user = useAuthStore(s => s.user); const owner = ['Owner', 'Admin', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '');
  const query = useQuery({ queryKey: ['supplier-price', user?.currentBusiness?.businessId, supplierId, itemId, unit], enabled: owner && !!supplierId && !!itemId,
    queryFn: async () => (await apiClient.get<{ unitPrice: number; date: string; unit: string }[]>(`/catalog/suppliers/${supplierId}/items/${itemId}/price-history`, { params: { unit } })).data });
  if (!owner || !supplierId || !itemId) return null;
  if (query.isPending) return <p className="text-xs">Loading price history…</p>;
  if (query.isError) return <p className="text-xs">Price history unavailable. <button type="button" className="underline" onClick={() => void query.refetch()}>Retry</button></p>;
  const last = query.data?.[0];
  return <p className="text-xs text-slate-600 mt-2">{last ? <>Last confirmed price: {formatMoney(last.unitPrice)} / {last.unit}, {last.date?.slice(0, 10)}. <button type="button" className="underline text-teal-800" onClick={() => onApply(last.unitPrice)}>Use this unit price</button> (Review tax, discount and current quote.)</> : 'No confirmed price history for this supplier, item and unit.'}</p>;
}
