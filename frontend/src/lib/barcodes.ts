import JsBarcode from 'jsbarcode';
import type { QueryClient } from '@tanstack/react-query';
import { catalogKeys, searchKeys, stockKeys } from './queryKeys';

export function barcodeValidation(value: string): string | undefined {
  const code = value.trim();
  if (code && (!/^[\x20-\x7e]{1,100}$/.test(code) || [...value].some(c => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127))) return 'Use 1 to 100 printable ASCII characters for Code 128.';
}

export function barcodeError(error: unknown): string {
  const data = (error as { response?: { data?: { error?: string; message?: string } } }).response?.data;
  const messages: Record<string, string> = {
    DUPLICATE_BARCODE: 'This barcode is reserved by another item, which may be archived. Choose a different barcode.',
    CATALOG_ITEM_VERSION_CONFLICT: 'This item changed. Reload it before saving the barcode.',
    CATALOG_ITEM_BARCODE_EXISTS: 'This item already has a barcode. Reload it to view or reprint the existing label.',
    CATALOG_ITEM_INACTIVE: 'This item is archived. Reactivate it before generating a barcode.',
    INVALID_BARCODE: data?.message || 'Enter a valid barcode.',
    INVALID_CATALOG_INPUT: data?.message || 'Check the item details.',
  };
  return messages[data?.error || ''] || 'Could not save the barcode. Check your connection and try again.';
}

export async function invalidateBarcodeQueries(client: QueryClient) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ['barcode'] }),
    client.invalidateQueries({ queryKey: catalogKeys.all }),
    client.invalidateQueries({ queryKey: searchKeys.all }),
    client.invalidateQueries({ queryKey: stockKeys.all }),
    client.invalidateQueries({ queryKey: ['duplicates'] }),
  ]);
}

export function canPrintBarcode(value: string): boolean {
  if (!/^[\x20-\x7e]{1,64}$/.test(value)) return false;
  try { JsBarcode({}, value, { format: 'CODE128' }); return true; } catch { return false; }
}
