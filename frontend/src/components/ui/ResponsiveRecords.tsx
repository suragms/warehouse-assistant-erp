import type { CSSProperties, ReactNode } from 'react';
import { useMobileViewport } from '../../layouts/useMobileViewport';
import { cn } from '../../lib/cn';

// Render one layout so hidden duplicates cannot receive focus or duplicate form IDs.
export function ResponsiveRecords({ label, mobile, children }: { label: string; mobile: ReactNode; children: ReactNode }) {
  const mobileViewport = useMobileViewport();
  return mobileViewport
    ? <div className="erp-record-list" role="region" aria-label={label}>{mobile}</div>
    : <>{children}</>;
}

export function RecordCard({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children?: ReactNode }) {
  return <article className="erp-record-card">
    <div className="min-w-0"><h3 className="erp-record-title">{title}</h3>{subtitle && <div className="erp-record-subtitle">{subtitle}</div>}</div>
    {children}
    {actions && <div className="erp-record-actions">{actions}</div>}
  </article>;
}

export function RecordFields({ fields }: { fields: { label: string; value: ReactNode }[] }) {
  return <dl className="erp-record-fields">{fields.map(field => <div className="min-w-0" key={field.label}><dt>{field.label}</dt><dd>{field.value}</dd></div>)}</dl>;
}

// Essential comparison columns keep their widths inside an independently scrollable region.
export function DataTableScroll({ label, children, minWidth = '40rem', className }: { label: string; children: ReactNode; minWidth?: string; className?: string }) {
  return <div role="region" aria-label={label} tabIndex={0} className={cn('erp-table-scroll', className)} style={{ '--erp-table-min-width': minWidth } as CSSProperties}>{children}</div>;
}
