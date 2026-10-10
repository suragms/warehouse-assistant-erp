import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { BarcodeCamera, BarcodeLabel, BarcodeLabels } from '../components/BarcodeTools';
import { canPrintBarcode } from '../lib/barcodes';

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ({
    font: '', measureText: (text: string) => ({ width: text.length * 8 }),
  }) as unknown as CanvasRenderingContext2D); vi.spyOn(window, 'print').mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it('encodes printable ASCII as Code 128 and refuses Unicode, controls, empty and oversized labels', () => {
  expect(canPrintBarcode('00123')).toBe(true); expect(canPrintBarcode('ABC/001?x')).toBe(true);
  for (const value of ['', 'é', 'bad\ncode', 'A'.repeat(65)]) expect(canPrintBarcode(value)).toBe(false);
  render(<BarcodeLabel value="é" name="Unsupported" />);
  expect(screen.getByRole('alert')).toHaveTextContent('cannot be printed');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
});
it('single reprint keeps readable name, encoded bars and human-readable value without mutation', async () => {
  render(<BarcodeLabel value="RICE-00123" name="Rice <safe>" />);
  expect(screen.getByRole('img')).toHaveAccessibleName('Barcode label RICE-00123');
  expect(document.querySelectorAll('svg rect').length).toBeGreaterThan(20);
  expect(document.querySelector('svg text')).toHaveTextContent('RICE-00123');
  fireEvent.click(screen.getByRole('button', { name: 'Print barcode label / Save PDF' }));
  expect(window.print).toHaveBeenCalledTimes(1);
  const root = document.querySelector('.barcode-print-root');
  expect(root).toHaveTextContent('Rice <safe>'); expect(root?.querySelector('script')).toBeNull();
  await act(async () => window.dispatchEvent(new Event('afterprint')));
  expect(document.querySelector('.barcode-print-root')).toBeNull();
});
it('batch labels render every selected eligible item separately and exclude malformed encodings', () => {
  render(<BarcodeLabels items={[{ id: '1', name: 'Rice', barcode: '00123' }, { id: '2', name: 'Wheat', barcode: 'ABC' }, { id: '3', name: 'Bad', barcode: 'é' }]} />);
  expect(screen.getByRole('alert')).toHaveTextContent('1 label(s)');
  fireEvent.click(screen.getByRole('button', { name: 'Print 2 selected labels / Save PDF' }));
  const root = document.querySelector('.barcode-print-root'); expect(root?.querySelectorAll('svg')).toHaveLength(2);
  expect(root).toHaveTextContent('Rice'); expect(root).toHaveTextContent('Wheat'); expect(root).not.toHaveTextContent('Bad');
});
function camera(media: Promise<MediaStream>, detect: () => Promise<{ rawValue: string }[]>) {
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BarcodeDetector', class { detect = detect; });
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: vi.fn(() => media) } });
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue();
}
it('camera success captures once and releases tracks without changing inventory', async () => {
  const stop = vi.fn(); const detected = vi.fn();
  camera(Promise.resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream), async () => [{ rawValue: '00123' }]);
  render(<BarcodeCamera onDetected={detected} />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
  await screen.findByText('Barcode captured. Review the lookup result.');
  expect(detected).toHaveBeenCalledExactlyOnceWith('00123'); expect(stop).toHaveBeenCalledTimes(1);
});
it('stopping while camera permission is pending releases a late stream without detection', async () => {
  let resolve!: (stream: MediaStream) => void; const stop = vi.fn(); const detected = vi.fn();
  camera(new Promise(r => { resolve = r; }), async () => [{ rawValue: '00123' }]);
  render(<BarcodeCamera onDetected={detected} />);
  fireEvent.click(screen.getByRole('button', { name: 'Scan with camera' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop camera' }));
  await act(async () => resolve({ getTracks: () => [{ stop }] } as unknown as MediaStream));
  expect(stop).toHaveBeenCalledTimes(1); expect(detected).not.toHaveBeenCalled();
});
