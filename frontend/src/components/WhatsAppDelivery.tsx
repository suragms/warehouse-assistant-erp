import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import apiClient from '../api/apiClient';
import { purchaseErrorMessage } from '../lib/purchaseValidation';
type Preview = { ready: boolean; recipient?: string; purchaseVersion: number; eligible: boolean; requiresVerification?: boolean; delivery: null | { version: string; status: string; errorCode?: string; attempts: number; updatedAt?: string } };
export function WhatsAppDelivery({ purchaseId }: { purchaseId: string }) {
  const query = useQuery({ queryKey: ['purchase-delivery', purchaseId], queryFn: async () => (await apiClient.get<Preview>(`/purchases/${purchaseId}/delivery/whatsapp`)).data });
  const [verified, setVerified] = useState(false);
  const send = useMutation({ mutationFn: async () => apiClient.post(`/purchases/${purchaseId}/delivery/whatsapp`, { requestId: crypto.randomUUID(), purchaseVersion: query.data!.purchaseVersion, deliveryVersion: query.data!.delivery?.version, recipient: query.data!.recipient, confirmed: true, verifiedNotDelivered: verified }), onSettled: () => { void query.refetch(); } });
  const data = query.data;
  const requiresVerification = data?.requiresVerification || data?.delivery?.status === 'unknown';
  return <section className="bg-white border rounded-xl p-4 space-y-3 min-w-0"><h2 className="font-semibold">WhatsApp purchase delivery</h2>
    {query.isPending && <p role="status">Loading delivery status…</p>}{query.isError && <p role="alert">Delivery status could not be loaded. <button className="underline" onClick={() => void query.refetch()}>Retry</button></p>}
    {data && <><p className="text-sm">Send a PDF containing this purchase's item names, quantities and units to the configured staff number. The PDF excludes prices and totals.</p>
      {!data.ready && <p>Configure WhatsApp credentials in Settings and enable delivery on the server.</p>}
      {data.recipient && <p className="break-all">Recipient: +{data.recipient}</p>}
      {data.delivery && <p role="status">Status: {data.delivery.status} · Attempts: {data.delivery.attempts}{data.delivery.status === 'accepted' && ' · Accepted by Meta; recipient delivery has not been verified.'}</p>}
      {requiresVerification && <label className="flex gap-2 text-sm"><input type="checkbox" checked={verified} onChange={e => setVerified(e.target.checked)} />I verified in Meta that this message was not sent and want to retry.</label>}
      {data.delivery?.status === 'sending' && <button className="underline" onClick={() => void query.refetch()}>Refresh delivery status</button>}
      {data.ready && data.eligible && data.delivery?.status !== 'accepted' && (data.delivery?.status !== 'sending' || requiresVerification) && <button className="bg-emerald-800 text-white rounded px-3 py-3 disabled:opacity-50" disabled={send.isPending || (requiresVerification && !verified)} onClick={() => { if (window.confirm(`Send this purchase quantity PDF to +${data.recipient}?`)) send.mutate(); }}>{send.isPending ? 'Sending…' : data.delivery ? 'Retry WhatsApp delivery' : 'Send purchase via WhatsApp'}</button>}
    </>}{send.isError && <p role="alert" className="text-red-700">{purchaseErrorMessage(send.error)}</p>}
  </section>;
}
