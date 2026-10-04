import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import MlPage from '../pages/MlPage';
import { mlApi, type MlAnalysis } from '../api/mlApi';
vi.mock('../api/mlApi', () => ({ mlApi: { items: vi.fn(), analyze: vi.fn(), monitoring: vi.fn(), monitoringSummary: vi.fn() } }));
const result: MlAnalysis = { itemId: 'i1', itemName: 'Rice', unit: 'KG', currentStock: 5, status: 'ready', message: 'Review forecast', generatedAt: '', model: 'ridge', modelVersion: 'validated-model', trainedAt: '2026-10-02', metrics: { mae: 1, rmse: 2, wape: .1 }, history: [{ date: '2026-10-02', quantity: 3 }], forecast: [{ date: '2026-10-03', quantity: 10, lower: 8, upper: 12 }], reorder: { quantity: 7, reorderDate: '2026-10-03', riskCategory: 'high', reason: 'Uses confirmed consumption' }, anomalies: [] };
function open() { const cache = new QueryClient({ defaultOptions: { queries: { retry: false, retryDelay: 0 } } }); return render(<QueryClientProvider client={cache}><MemoryRouter><MlPage /></MemoryRouter></QueryClientProvider>); }
beforeEach(() => { vi.resetAllMocks(); vi.mocked(mlApi.monitoringSummary).mockResolvedValue([]); vi.mocked(mlApi.items).mockResolvedValue({ items: [{ id: 'i1', name: 'Rice', itemCode: 'R1', unit: 'KG' }], totalCount: 1 }); });
describe('Inventory predictions', () => {
  it('distinguishes incomplete outcomes from completed actuals', async () => {
    vi.mocked(mlApi.analyze).mockResolvedValue(result);
    vi.mocked(mlApi.monitoring).mockResolvedValue([{ id: 'log1', modelVersion: 'v1', inputVersion: 'd1', createdAt: '', startDate: '2026-10-03', horizon: 7, predictedQuantity: 70, actualQuantity: null, observedDays: 2 }]);
    open(); await screen.findByRole('option', { name: 'Rice · R1' }); await userEvent.selectOptions(screen.getByLabelText('Item'), 'i1');
    await userEvent.click(await screen.findByRole('button', { name: 'Prediction outcomes' })); expect(await screen.findByText('Awaiting usage (2/7 days)')).toBeVisible();
  });
  it('shows loading without a fabricated forecast', () => { vi.mocked(mlApi.items).mockReturnValue(new Promise(() => {})); open(); expect(screen.getByText('Loading items…')).toBeVisible(); expect(screen.queryByText('Daily forecast')).not.toBeInTheDocument(); });
  it('shows empty catalog', async () => { vi.mocked(mlApi.items).mockResolvedValue({ items: [], totalCount: 0 }); open(); expect(await screen.findByText('No matching items.')).toBeVisible(); });
  it('renders history, model metrics, forecast and recommendation from the API', async () => { vi.mocked(mlApi.analyze).mockResolvedValue(result); open(); await screen.findByRole('option', { name: 'Rice · R1' }); await userEvent.selectOptions(screen.getByLabelText('Item'), 'i1'); expect(await screen.findByText('Uses confirmed consumption')).toBeVisible(); expect(screen.getByText('Available stock: 5 KG')).toBeVisible(); expect(screen.getByText(/validated-model/)).toBeVisible(); });
  it('explains insufficient history and does not show a prediction table', async () => { vi.mocked(mlApi.analyze).mockResolvedValue({ ...result, status: 'insufficient_history', message: 'Insufficient historical data', forecast: [], reorder: null }); open(); await screen.findByRole('option', { name: 'Rice · R1' }); await userEvent.selectOptions(screen.getByLabelText('Item'), 'i1'); expect(await screen.findByText('Insufficient historical data')).toBeVisible(); expect(screen.queryByText('Daily forecast')).not.toBeInTheDocument(); });
  it('offers retry on API failure', async () => { vi.mocked(mlApi.analyze).mockRejectedValue(new Error('offline')); open(); await screen.findByRole('option', { name: 'Rice · R1' }); await userEvent.selectOptions(screen.getByLabelText('Item'), 'i1'); expect(await screen.findByRole('button', { name: 'Retry prediction' }, { timeout: 3000 })).toBeVisible(); });
});
