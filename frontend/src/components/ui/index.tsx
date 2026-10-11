import React from 'react';
import { DialogFrame } from './DialogFrame';
import { cn } from '../../lib/cn';

// ── Button ─────────────────────────────────────────────────────────────────

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = 'button',
  ...rest
}) => (
  <button
    {...rest}
    type={type}
    aria-busy={loading || undefined}
    disabled={disabled || loading}
    className={cn(
      'ui-button inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed',
      variant === 'primary' && 'bg-[#0E4F46] text-white hover:bg-[#065F4F] focus:ring-[#159A8A]',
      variant === 'secondary' && 'bg-white text-[#0E4F46] border border-[#0E4F46] hover:bg-[#F7F9F6] focus:ring-[#159A8A]',
      variant === 'ghost' && 'bg-transparent text-[#475569] hover:bg-gray-100 focus:ring-gray-300',
      variant === 'danger' && 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
      size === 'sm' && 'px-3 py-1.5 text-xs',
      size === 'md' && 'px-4 py-2 text-sm',
      size === 'lg' && 'px-6 py-3 text-base',
      className
    )}
  >
    {loading ? (
      <span className="animate-spin h-4 w-4 border-2 border-current border-t-transparent rounded-full" aria-hidden="true" />
    ) : (
      icon
    )}
    {children}
  </button>
);

// ── Input ──────────────────────────────────────────────────────────────────

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, hint, className, id, ...rest }, ref) => {
    const generatedId = React.useId(); const inputId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1 min-w-0">
        {label && (
          <label htmlFor={inputId} className="text-sm font-medium text-[#0F172A]">
            {label}
          </label>
        )}
        <input
          ref={ref}
          id={inputId}
          className={cn(
            'block w-full rounded-md border px-3 py-2 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#159A8A] focus:border-[#159A8A]',
            error ? 'border-red-400 focus:ring-red-400' : 'border-[#E2E8E6]',
            className
          )}
          {...rest}
          aria-invalid={!!error}
          aria-describedby={[rest['aria-describedby'], error && `${inputId}-error`, !error && hint && `${inputId}-hint`].filter(Boolean).join(' ') || undefined}
        />
        {error && (
          <p id={`${inputId}-error`} className="text-xs text-red-600" role="alert">
            {error}
          </p>
        )}
        {!error && hint && <p id={`${inputId}-hint`} className="text-xs text-gray-500">{hint}</p>}
      </div>
    );
  }
);
Input.displayName = 'Input';

// ── Select ─────────────────────────────────────────────────────────────────

interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ label, error, options, placeholder, className, id, ...rest }, ref) => {
    const generatedId = React.useId(); const selectId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1 min-w-0">
        {label && (
          <label htmlFor={selectId} className="text-sm font-medium text-[#0F172A]">
            {label}
          </label>
        )}
        <select
          ref={ref}
          id={selectId}
          className={cn(
            'block w-full rounded-md border px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#159A8A] focus:border-[#159A8A] bg-white',
            error ? 'border-red-400 focus:ring-red-400' : 'border-[#E2E8E6]',
            className
          )}
          {...rest}
          aria-invalid={!!error}
          aria-describedby={[rest['aria-describedby'], error && `${selectId}-error`].filter(Boolean).join(' ') || undefined}
        >
          {placeholder && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {error && <p id={`${selectId}-error`} className="text-xs text-red-600" role="alert">{error}</p>}
      </div>
    );
  }
);
Select.displayName = 'Select';

// ── Textarea ───────────────────────────────────────────────────────────────

interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ label, error, className, id, ...rest }, ref) => {
    const generatedId = React.useId(); const textareaId = id ?? generatedId;
    return (
      <div className="flex flex-col gap-1 min-w-0">
        {label && (
          <label htmlFor={textareaId} className="text-sm font-medium text-[#0F172A]">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          id={textareaId}
          rows={3}
          className={cn(
            'block w-full rounded-md border px-3 py-2 text-sm text-[#0F172A] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#159A8A] focus:border-[#159A8A] resize-y',
            error ? 'border-red-400 focus:ring-red-400' : 'border-[#E2E8E6]',
            className
          )}
          {...rest}
          aria-invalid={!!error}
          aria-describedby={[rest['aria-describedby'], error && `${textareaId}-error`].filter(Boolean).join(' ') || undefined}
        />
        {error && <p id={`${textareaId}-error`} className="text-xs text-red-600" role="alert">{error}</p>}
      </div>
    );
  }
);
Textarea.displayName = 'Textarea';

// ── Badge ──────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode;
  variant?: 'green' | 'red' | 'gray' | 'yellow' | 'blue';
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({ children, variant = 'gray', className }) => (
  <span
    className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium',
      variant === 'green' && 'bg-emerald-100 text-emerald-800',
      variant === 'red' && 'bg-red-100 text-red-800',
      variant === 'gray' && 'bg-gray-100 text-gray-700',
      variant === 'yellow' && 'bg-yellow-100 text-yellow-800',
      variant === 'blue' && 'bg-blue-100 text-blue-800',
      className
    )}
  >
    {children}
  </span>
);

// ── Skeleton ───────────────────────────────────────────────────────────────

export const Skeleton: React.FC<{ className?: string }> = ({ className }) => (
  <div className={cn('animate-pulse bg-gray-200 rounded', className)} aria-hidden="true" />
);

// ── Card ───────────────────────────────────────────────────────────────────

export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className }) => (
  <div className={cn('min-w-0 bg-white rounded-xl border border-[#E2E8E6] shadow-sm', className)}>{children}</div>
);

// ── ConfirmDialog ──────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: 'danger' | 'primary';
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmDialog: React.FC<ConfirmDialogProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  variant = 'danger',
  loading,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  return (
    <DialogFrame open={open} title={title} onClose={onCancel} busy={!!loading} className="max-w-sm">
      <div className="p-5 space-y-4">
        <h2 className="text-lg font-semibold text-[#0F172A] break-words">{title}</h2>
        <p className="text-sm text-[#475569] break-words">{description}</p>
        <div className="flex flex-wrap gap-3 justify-end">
          <Button variant="ghost" onClick={onCancel} disabled={loading}>{cancelLabel}</Button>
          <Button variant={variant} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
        </div>
      </div>
    </DialogFrame>
  );
};

// ── Modal ──────────────────────────────────────────────────────────────────

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
}

export const Modal: React.FC<ModalProps> = ({ open, title, onClose, children, size = 'md' }) => {
  if (!open) return null;
  return (
    <DialogFrame open={open} title={title} onClose={onClose} className={size === 'sm' ? 'max-w-sm' : size === 'lg' ? 'max-w-2xl' : 'max-w-lg'}>
      <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-[#E2E8E6]">
        <h2 className="text-lg font-semibold text-[#0F172A] min-w-0 break-words">{title}</h2>
        <button type="button" onClick={onClose} className="ui-icon-button shrink-0 text-gray-500 hover:text-gray-700" aria-label="Close"><X className="h-5 w-5" /></button>
      </div>
      <div className="px-5 py-4 min-w-0">{children}</div>
    </DialogFrame>
  );
};

// ── PageHeader ─────────────────────────────────────────────────────────────

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export const PageHeader: React.FC<PageHeaderProps> = ({ title, subtitle, actions }) => (
  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-5 min-w-0">
    <div className="min-w-0">
      <h1 className="text-2xl font-bold text-[#0F172A] break-words">{title}</h1>
      {subtitle && <p className="text-sm text-[#475569] mt-0.5">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2 min-w-0">{actions}</div>}
  </div>
);

// ── EmptyState ─────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ icon, title, description, action }) => (
  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
    {icon && <div className="text-gray-300 mb-4">{icon}</div>}
    <h3 className="text-base font-semibold text-[#0F172A] mb-1">{title}</h3>
    {description && <p className="text-sm text-[#475569] mb-4 max-w-sm">{description}</p>}
    {action}
  </div>
);

// ── ErrorState ─────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export const ErrorState: React.FC<ErrorStateProps> = ({ message = 'Something went wrong.', onRetry }) => (
  <div role="alert" className="flex flex-col items-center justify-center py-10 px-4 text-center">
    <AlertCircle className="h-10 w-10 text-red-400 mb-3" />
    <p className="text-sm text-[#475569] mb-4">{message}</p>
    {onRetry && (
      <Button variant="secondary" onClick={onRetry}>
        Retry
      </Button>
    )}
  </div>
);

// ── Pagination ─────────────────────────────────────────────────────────────

interface PaginationProps {
  page: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (p: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({
  page,
  totalPages,
  totalCount,
  pageSize,
  onPageChange,
}) => {
  const start = (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, totalCount);
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mt-4 text-sm text-[#475569]">
      <span>
        {totalCount === 0 ? 'No results' : `Showing ${start}–${end} of ${totalCount}`}
      </span>
      <div className="flex flex-wrap gap-1">
        <button
          className="ui-button px-3 py-1 rounded border border-[#E2E8E6] hover:bg-gray-50 disabled:opacity-40"
          onClick={() => onPageChange(page - 1)}
          disabled={page <= 1}
          aria-label="Previous page"
        >
          ‹
        </button>
        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
          const p = Math.max(1, Math.min(page - 2, totalPages - 4)) + i;
          if (p < 1 || p > totalPages) return null;
          return (
            <button
              key={p}
              className={cn(
                'ui-button px-3 py-1 rounded border',
                p === page
                  ? 'bg-[#0E4F46] text-white border-[#0E4F46]'
                  : 'border-[#E2E8E6] hover:bg-gray-50'
              )}
              onClick={() => onPageChange(p)}
              aria-label={`Page ${p}`}
              aria-current={p === page ? 'page' : undefined}
            >
              {p}
            </button>
          );
        })}
        <button
          className="ui-button px-3 py-1 rounded border border-[#E2E8E6] hover:bg-gray-50 disabled:opacity-40"
          onClick={() => onPageChange(page + 1)}
          disabled={page >= totalPages}
          aria-label="Next page"
        >
          ›
        </button>
      </div>
    </div>
  );
};

// needed for Modal close icon import
import { X, AlertCircle } from 'lucide-react';
