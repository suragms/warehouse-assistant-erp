import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { Button, Input, Select, Textarea, Modal, ConfirmDialog } from '../components/ui';
import { ThemeProvider, ThemeToggle } from '../components/ThemeProvider';

beforeEach(() => { localStorage.clear(); delete document.documentElement.dataset.theme; });
it('associates repeated labels with unique controls and announces field errors and hints', () => {
  render(<><Input label="Quantity" error="Enter a positive quantity" /><Input label="Quantity" hint="In kilograms" /><Select label="Unit" error="Choose a unit" options={[]} /><Textarea label="Notes" error="Too long" /></>);
  const quantities = screen.getAllByLabelText('Quantity');
  expect(quantities[0].id).not.toBe(quantities[1].id);
  expect(quantities[0]).toHaveAttribute('aria-invalid', 'true');
  expect(quantities[0]).toHaveAccessibleDescription('Enter a positive quantity');
  expect(quantities[1]).toHaveAccessibleDescription('In kilograms');
  expect(screen.getByLabelText('Unit')).toHaveAccessibleDescription('Choose a unit');
  expect(screen.getByLabelText('Notes')).toHaveAccessibleDescription('Too long');
});
it('secondary actions inside a form never submit it implicitly', () => {
  const submit = vi.fn(e => e.preventDefault());
  render(<form onSubmit={submit}><Button>Preview labels</Button><Button type="submit">Save</Button></form>);
  fireEvent.click(screen.getByRole('button', { name: 'Preview labels' })); expect(submit).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Save' })); expect(submit).toHaveBeenCalledOnce();
});
it('modal is named, traps tabbing, closes on Escape and returns focus to its opener', () => {
  function View() { const [open, setOpen] = useState(false); return <><button onClick={() => setOpen(true)}>Open form</button><Modal open={open} title="Create category" onClose={() => setOpen(false)}><Input label="Category name" /><Button>Save category</Button></Modal></>; }
  render(<View />); const opener = screen.getByRole('button', { name: 'Open form' }); opener.focus(); fireEvent.click(opener);
  const dialog = screen.getByRole('dialog', { name: 'Create category' });
  const last = screen.getByRole('button', { name: 'Save category' }); last.focus(); fireEvent.keyDown(last, { key: 'Tab' });
  expect(dialog.contains(document.activeElement)).toBe(true); expect(last).not.toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'Escape' }); expect(screen.queryByRole('dialog')).not.toBeInTheDocument(); expect(opener).toHaveFocus();
});
it('a pending confirmation cannot be dismissed with Escape or cancelled', () => {
  const close = vi.fn(); render(<ConfirmDialog open loading title="Archive item" description="Preserve its history" onCancel={close} onConfirm={vi.fn()} />);
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' }); expect(close).not.toHaveBeenCalled(); expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
});
it('uses the system preference until an explicit theme choice is saved', () => {
  vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>); expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
  fireEvent.click(screen.getByRole('button', { name: 'Use light theme' })); expect(document.documentElement).toHaveAttribute('data-theme', 'light'); expect(localStorage.getItem('warehouse-theme')).toBe('light');
  vi.unstubAllGlobals();
});
it('restores a saved light theme even if the operating system uses dark mode', () => {
  localStorage.setItem('warehouse-theme', 'light'); vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  render(<ThemeProvider><ThemeToggle /></ThemeProvider>); expect(document.documentElement).toHaveAttribute('data-theme', 'light'); vi.unstubAllGlobals();
});
