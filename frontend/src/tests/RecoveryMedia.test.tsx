import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, it, vi } from 'vitest';
import apiClient from '../api/apiClient';
import PasswordRecovery from '../pages/auth/PasswordRecovery';
import { MediaTextInput } from '../components/AI/MediaTextInput';
vi.mock('../api/apiClient', () => ({ default: { get: vi.fn(), post: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); window.history.replaceState(null, '', '/'); });
it('queues recovery without claiming mail was delivered', async () => {
  vi.mocked(apiClient.post).mockResolvedValue({ data: { message: 'If eligible, instructions will be queued.' } });
  render(<MemoryRouter><PasswordRecovery /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request reset instructions' }));
  expect(await screen.findByRole('status')).toHaveTextContent('queued');
  expect(apiClient.post).toHaveBeenCalledWith('/auth/forgot-password', { email: 'owner@example.test' });
});
it('removes the reset fragment and rejects mismatching passwords before sending', async () => {
  window.history.replaceState(null, '', '/reset-password#email=owner%40example.test&token=fixture-token');
  render(<MemoryRouter><PasswordRecovery reset /></MemoryRouter>);
  expect(window.location.hash).toBe('');
  fireEvent.change(screen.getByLabelText('New password'), { target: { value: 'new-password' } });
  fireEvent.change(screen.getByLabelText('Confirm new password'), { target: { value: 'other-password' } });
  fireEvent.click(screen.getByRole('button', { name: 'Change password' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Passwords must match'); expect(apiClient.post).not.toHaveBeenCalled();
});
it('shows recovery configuration failures without claiming success', async () => {
  vi.mocked(apiClient.post).mockRejectedValue({ isAxiosError: true, response: { status: 503, data: { error: { code: 'PASSWORD_RESET_UNAVAILABLE' } } } });
  render(<MemoryRouter><PasswordRecovery /></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'owner@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Request reset instructions' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('not configured'); expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
const media = () => {
  const useText = vi.fn(); const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(<QueryClientProvider client={client}><MediaTextInput kind="voice" disabled={false} onText={useText} /></QueryClientProvider>);
  const details = result.container.querySelector('details')!; details.open = true; fireEvent(details, new Event('toggle'));
  return useText;
};
it('does not offer upload when a provider is disabled', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { ocr: false, voice: false } }); media();
  expect(await screen.findByText(/This provider is not configured/)).toBeInTheDocument(); expect(screen.queryByLabelText('Voice recording')).not.toBeInTheDocument();
});
it('requires consent and review before using transcribed text', async () => {
  vi.mocked(apiClient.get).mockResolvedValue({ data: { ocr: false, voice: true } });
  vi.mocked(apiClient.post).mockResolvedValue({ data: { text: 'Buy 10 kg rice' } }); const useText = media();
  const upload = await screen.findByLabelText('Voice recording');
  fireEvent.change(upload, { target: { files: [new File(['RIFF0000WAVEfixture'], 'voice.wav', { type: 'audio/wav' })] } });
  expect(screen.getByRole('button', { name: 'Transcribe recording' })).toBeDisabled();
  fireEvent.click(screen.getByRole('checkbox')); fireEvent.click(screen.getByRole('button', { name: 'Transcribe recording' }));
  expect(await screen.findByLabelText('Review extracted text')).toHaveValue('Buy 10 kg rice'); expect(useText).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Review extracted text'), { target: { value: 'Buy 12 kg rice' } });
  fireEvent.click(screen.getByRole('button', { name: 'Use reviewed text' })); await waitFor(() => expect(useText).toHaveBeenCalledWith('Buy 12 kg rice'));
});
