import { afterEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { ResponsiveRecords, RecordCard, RecordFields, DataTableScroll } from '../components/ui/ResponsiveRecords';

afterEach(() => vi.unstubAllGlobals());
it('renders a single usable layout and preserves selection when resizing across the mobile breakpoint', () => {
  vi.stubGlobal('matchMedia', undefined); vi.stubGlobal('innerWidth', 390);
  function View() {
    const [selected, setSelected] = useState(false);
    const checkbox = <input type="checkbox" aria-label="Select rice" checked={selected} onChange={e => setSelected(e.target.checked)} />;
    return <ResponsiveRecords label="Stock records" mobile={<RecordCard title="Rice" actions={checkbox}><RecordFields fields={[{ label: 'Available', value: '12.5 KG' }]} /></RecordCard>}><DataTableScroll label="Stock comparison"><table><thead><tr><th>Item</th></tr></thead><tbody><tr><td>Rice{checkbox}</td></tr></tbody></table></DataTableScroll></ResponsiveRecords>;
  }
  render(<View />);
  expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.getAllByRole('checkbox')).toHaveLength(1);
  fireEvent.click(screen.getByLabelText('Select rice')); expect(screen.getByLabelText('Select rice')).toBeChecked();
  act(() => { vi.stubGlobal('innerWidth', 1366); window.dispatchEvent(new Event('resize')); });
  expect(screen.getByRole('table')).toBeVisible(); expect(screen.getAllByRole('checkbox')).toHaveLength(1); expect(screen.getByLabelText('Select rice')).toBeChecked();
  act(() => { vi.stubGlobal('innerWidth', 320); window.dispatchEvent(new Event('resize')); });
  expect(screen.queryByRole('table')).not.toBeInTheDocument(); expect(screen.getByLabelText('Select rice')).toBeChecked();
  expect(screen.getByText('12.5 KG')).toBeVisible();
});
it('keeps the same explicit action handler and readable metadata in the mobile representation', () => {
  vi.stubGlobal('matchMedia', undefined); vi.stubGlobal('innerWidth', 320); const open = vi.fn();
  render(<ResponsiveRecords label="Purchase orders" mobile={<RecordCard title="PO-2026" subtitle="Kerala supplier" actions={<button type="button" onClick={open}>View purchase</button>}><RecordFields fields={[{ label: 'Total', value: '₹1,234.50' }, { label: 'Status', value: 'Confirmed' }]} /></RecordCard>}><table><tbody><tr><td>Desktop order</td></tr></tbody></table></ResponsiveRecords>);
  expect(screen.getByRole('region', { name: 'Purchase orders' })).toBeVisible(); fireEvent.click(screen.getByRole('button', { name: 'View purchase' })); expect(open).toHaveBeenCalledOnce();
  expect(screen.getByText('₹1,234.50')).toBeVisible(); expect(screen.getByText('Confirmed')).toBeVisible(); expect(screen.queryByText('Desktop order')).not.toBeInTheDocument();
});
