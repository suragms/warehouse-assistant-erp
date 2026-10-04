import apiClient from './apiClient';

export interface MlAnalysis {
  itemId: string; itemName: string; unit: string; currentStock: number; status: string; message: string;
  generatedAt: string; model: string | null; modelVersion: string | null; trainedAt: string | null;
  metrics: { mae: number; rmse: number; wape: number | null } | null;
  history: { date: string; quantity: number }[];
  forecast: { date: string; quantity: number; lower: number; upper: number }[];
  reorder: { quantity: number; reorderDate: string | null; riskCategory: string; reason: string } | null;
  anomalies: { id: string; date: string; type: string; quantity: number; score: number; explanation: string }[];
}
export interface PredictionOutcome { id: string; modelVersion: string; inputVersion: string; createdAt: string; startDate: string; horizon: number; predictedQuantity: number; actualQuantity: number | null; observedDays: number }
export interface MonitoringSummary { modelVersion: string; horizon: number; completedForecasts: number; mae: number; rmse: number; wape: number | null; mape: number | null; recentMae: number; previousMae: number | null; reviewAlert: boolean; message: string }
export const mlApi = {
  items: async (search: string, page: number) => (await apiClient.get<{ items: { id: string; name: string; itemCode: string; unit: string }[]; totalCount: number }>('/ml/items', { params: { search, page, pageSize: 50 } })).data,
  analyze: async (id: string, horizon: number) => (await apiClient.get<MlAnalysis>(`/ml/items/${id}`, { params: { horizon } })).data,
  monitoring: async (id: string) => (await apiClient.get<PredictionOutcome[]>(`/ml/items/${id}/monitoring`)).data,
  monitoringSummary: async (id: string) => (await apiClient.get<MonitoringSummary[]>(`/ml/items/${id}/monitoring-summary`)).data,
};
