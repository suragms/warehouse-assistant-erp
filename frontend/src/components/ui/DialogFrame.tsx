import { useEffect, useRef, type ReactNode, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';

// Native modal dialogs provide background isolation, Escape and focus restoration.
export function DialogFrame({ open, title, onClose, children, className, busy = false }: { open: boolean; title: string; onClose: () => void; children: ReactNode; className?: string; busy?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (!open || !dialog.current) return;
    const element = dialog.current, previous = document.activeElement as HTMLElement | null;
    if (typeof element.showModal === 'function') element.showModal(); else element.setAttribute('open', '');
    element.querySelector<HTMLElement>('[autofocus], input:not([disabled]), select:not([disabled]), button:not([disabled]), [tabindex="0"]')?.focus();
    return () => { if (element.open && typeof element.close === 'function') element.close(); previous?.focus(); };
  }, [open]);
  const trap = (event: KeyboardEvent<HTMLDialogElement>) => {
    if (event.key === 'Escape') { event.preventDefault(); if (!busy) onClose(); }
    if (event.key !== 'Tab') return;
    const controls = Array.from(dialog.current?.querySelectorAll<HTMLElement>('button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex="0"]') ?? []).filter(e => !e.hidden && e.getAttribute('aria-hidden') !== 'true');
    if (!controls.length) { event.preventDefault(); dialog.current?.focus(); return; }
    const first = controls[0], last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };
  if (!open) return null;
  return createPortal(<dialog ref={dialog} aria-modal="true" aria-label={title} tabIndex={-1} className={cn('ui-dialog', className)} onKeyDown={trap} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {children}
  </dialog>, document.body);
}
