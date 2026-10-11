import { hasPermission } from '../../auth/hasPermission';
import { SafeImage } from '../SafeImage';
import { purchaseErrorMessage } from '../../lib/purchaseValidation';
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, Plus, X, Check, XCircle, RotateCcw } from 'lucide-react';
import { damageApi, type CreateDamageReportDto, type UpdateDamageReportStatusDto } from '../../api/damageApi';
import { useAuthStore } from '../../stores/authStore';

interface DamageReportSectionProps {
  purchaseOrderId: string;
  orderItems: Array<{
    id: string;
    catalogItemId: string;
    catalogItemName: string;
    itemCode: string;
    orderedQuantity: number;
    receivedQuantity: number;
  }>;
}

export default function DamageReportSection({ purchaseOrderId, orderItems }: DamageReportSectionProps) {
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CreateDamageReportDto>({
    qtyDamaged: 0,
    damageType: 'Damaged',
    emitNotification: true
  });
  const queryClient = useQueryClient();
  const user = useAuthStore(state => state.user);
  const can = (permission: string) => hasPermission(user, permission);
  const [validation, setValidation] = useState('');

  const { data: reports = [], isLoading, error, refetch } = useQuery({
    queryKey: ['damage-reports', purchaseOrderId],
    queryFn: () => damageApi.getDamageReports(purchaseOrderId),
  });

  const createMutation = useMutation({
    mutationFn: (dto: CreateDamageReportDto) => damageApi.createDamageReport(purchaseOrderId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-reports', purchaseOrderId] });
      setShowForm(false);
      setFormData({ qtyDamaged: 0, damageType: 'Damaged', emitNotification: true });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: ({ reportId, dto }: { reportId: string; dto: UpdateDamageReportStatusDto }) =>
      damageApi.updateDamageReportStatus(purchaseOrderId, reportId, dto),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['damage-reports', purchaseOrderId] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (createMutation.isPending) return;
    if (!Number.isFinite(formData.qtyDamaged) || formData.qtyDamaged <= 0) {
      setValidation('Please enter a positive damaged quantity.');
      return;
    }
    setValidation('');
    createMutation.mutate(formData);
  };

  const handleStatusUpdate = (reportId: string, status: 'Approved' | 'Returned' | 'Rejected') => {
    updateStatusMutation.mutate({ reportId, dto: { status } });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved': return <Check className="w-4 h-4 text-emerald-600" />;
      case 'rejected': return <XCircle className="w-4 h-4 text-red-600" />;
      case 'returned': return <RotateCcw className="w-4 h-4 text-blue-600" />;
      default: return <AlertTriangle className="w-4 h-4 text-amber-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved': return 'bg-emerald-50 text-emerald-700';
      case 'rejected': return 'bg-red-50 text-red-700';
      case 'returned': return 'bg-blue-50 text-blue-700';
      default: return 'bg-amber-50 text-amber-700';
    }
  };

  if (isLoading) {
    return <div className="text-center p-4 text-slate-500">Loading damage reports...</div>;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
      <div className="p-4 sm:p-6 border-b border-slate-200 flex flex-wrap gap-3 items-center justify-between">
        <div className="flex items-center gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600" />
          <h2 className="text-lg font-semibold text-slate-900">Damage Reports</h2>
          {reports.length > 0 && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 text-xs font-medium rounded-full">
              {reports.length} report{reports.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        {can('purchase.damage_report') && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            Report Damage
          </button>
        )}
      </div>

      {(error || createMutation.error || updateStatusMutation.error) && <p role="alert" className="p-4 text-red-700">{purchaseErrorMessage(error || createMutation.error || updateStatusMutation.error)} <button onClick={() => void refetch()}>Retry</button></p>}
      {/* Create Damage Report Form */}
      {showForm && (
        <div className="p-6 bg-amber-50 border-b border-slate-200">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-medium text-slate-900">Report New Damage</h3>
            <button
              aria-label="Close damage form" onClick={() => setShowForm(false)}
              className="p-1 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">{validation && <p role="alert" className="text-red-700">{validation}</p>}
            <label className="block text-sm">Photo URL (HTTPS)<input type="url" maxLength={2000} className="block w-full border rounded p-3" value={formData.photoUrl ?? ''} onChange={e => setFormData({ ...formData, photoUrl: e.target.value || undefined })} /></label>
            {formData.photoUrl && <SafeImage src={formData.photoUrl} alt="Damage photo preview" />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Select Item
                </label>
                <select
                  aria-label="Damage item" value={formData.catalogItemId || ''}
                  onChange={(e) => {
                    const item = orderItems.find(i => i.catalogItemId === e.target.value);
                    setFormData({
                      ...formData,
                      catalogItemId: e.target.value || undefined,
                      itemName: item?.catalogItemName || formData.itemName
                    });
                  }}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Select Item or Enter Custom Name --</option>
                  {orderItems.map(item => (
                    <option key={item.id} value={item.catalogItemId}>
                      {item.itemCode} - {item.catalogItemName}
                    </option>
                  ))}
                </select>
              </div>

              {!formData.catalogItemId && (
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Custom Item Name
                  </label>
                  <input
                    type="text"
                    aria-label="Custom damaged item name" value={formData.itemName || ''}
                    onChange={(e) => setFormData({ ...formData, itemName: e.target.value })}
                    placeholder="Enter item name"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Damaged Quantity
                </label>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  aria-label="Damaged quantity" value={formData.qtyDamaged}
                  onChange={(e) => setFormData({ ...formData, qtyDamaged: parseFloat(e.target.value) || 0 })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Damage Type
                </label>
                <select
                  aria-label="Damage type" value={formData.damageType}
                  onChange={(e) => setFormData({ ...formData, damageType: e.target.value as any })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="Damaged">Damaged</option>
                  <option value="Short">Short Delivery</option>
                  <option value="Missing">Missing</option>
                  <option value="Returned">Returned</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Reason
                </label>
                <select
                  aria-label="Damage reason" value={formData.reason || ''}
                  onChange={(e) => setFormData({ ...formData, reason: e.target.value as any || undefined })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="">-- Select Reason --</option>
                  <option value="TornBag">Torn Bag</option>
                  <option value="WetDamage">Wet Damage</option>
                  <option value="WrongItem">Wrong Item</option>
                  <option value="ShortWeight">Short Weight</option>
                  <option value="Other">Other</option>
                </select>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-2">
                  Notes
                </label>
                <textarea
                  aria-label="Damage notes" value={formData.notes || ''}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  rows={3}
                  placeholder="Additional details about the damage..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="px-4 py-2 text-slate-700 border border-slate-300 rounded-lg hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMutation.isPending}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg disabled:opacity-50"
              >
                {createMutation.isPending ? 'Reporting...' : 'Report Damage'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Reports List */}
      <div className="p-6">
        {error ? null : reports.length === 0 ? (
          <div className="text-center py-8 text-slate-500">
            <AlertTriangle className="w-12 h-12 mx-auto mb-3 text-slate-300" />
            <p>No damage reports for this purchase order.</p>
            {can('purchase.damage_report') && (
              <p className="text-sm mt-1">Click "Report Damage" above to create one.</p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {reports.map((report) => (
              <div
                key={report.id}
                className="border border-slate-200 rounded-lg p-4 hover:bg-slate-50 transition-colors"
              >
                <div className="flex flex-wrap gap-3 items-start justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-3 mb-2">
                      {getStatusIcon(report.status)}
                      <h4 className="font-medium text-slate-900">{report.itemName}</h4>
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${getStatusColor(report.status)}`}>
                        {report.status}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm text-slate-600">
                      <div>
                        <span className="font-medium">Quantity:</span> {report.qtyDamaged} {report.unit || ''}
                      </div>
                      <div>
                        <span className="font-medium">Type:</span> {report.damageType}
                      </div>
                      {report.reason && (
                        <div>
                          <span className="font-medium">Reason:</span> {report.reason.replace(/([A-Z])/g, ' $1').trim()}
                        </div>
                      )}
                    </div>
                    {report.photoUrl && <SafeImage src={report.photoUrl} alt="Damage evidence" />}
                  {report.notes && (
                      <p className="text-sm text-slate-600 mt-2 italic">{report.notes}</p>
                    )}
                    <div className="text-xs text-slate-400 mt-2">
                      Reported by {report.reportedBy || 'Unknown'} on {new Date(report.createdAt).toLocaleString()}
                    </div>
                  </div>

                  {report.status === 'pending' && can('purchase.damage_approve') && (
                    <div className="flex gap-2 ml-4">
                      <button
                        onClick={() => handleStatusUpdate(report.id, 'Approved')}
                        disabled={updateStatusMutation.isPending}
                        className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
                        title="Approve"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(report.id, 'Rejected')}
                        disabled={updateStatusMutation.isPending}
                        className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Reject"
                      >
                        <XCircle className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleStatusUpdate(report.id, 'Returned')}
                        disabled={updateStatusMutation.isPending}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Return"
                      >
                        <RotateCcw className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}