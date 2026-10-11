import apiClient from './apiClient';
import { PurchaseStatus, DeliveryState, PaymentState } from './purchaseApi';

export interface DashboardMetricsDto {
  purchaseMetrics: {
    todayPurchasesCount: number;
    pendingPurchasesCount: number;
    activePurchasesCount: number;
    completedPurchasesCount: number;
    totalPurchaseSpend?: number;
  };
  stockMetrics: {
    totalCatalogItems: number;
    lowStockCount: number;
    outOfStockCount: number;
    itermsWithPhysicalVariance: number;
  };
  deliveryMetrics: {
    draftPurchases: number;
    confirmedPurchases: number;
    dispatchedPurchases: number;
    arrivedPurchases: number;
    verificationPending: number;
  };
  operationalAlerts: Array<{
    type: string;
    title: string;
    message: string;
    timestamp: string;
    referenceType?: string;
    referenceId?: string;
  }>;
  recentPurchases: Array<{
    id: string;
    orderNumber: string;
    supplierName: string;
    status: PurchaseStatus;
    deliveryState: DeliveryState;
    paymentState: PaymentState;
    grandTotal?: number;
    createdAt: string;
  }>;
  recentStockActivity: Array<{
    id: string;
    itemCode: string;
    catalogItemName: string;
    movementType: string;
    quantityDelta: number;
    beforeQuantity: number;
    afterQuantity: number;
    reason: string;
    date: string;
    userId: string;
  }>;
}

export const dashboardApi = {
  getDashboard: async (): Promise<DashboardMetricsDto> => {
    const res = await apiClient.get('/dashboard');
    return res.data;
  },
};
