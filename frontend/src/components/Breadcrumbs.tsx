import { Link, useLocation } from 'react-router-dom';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  if (pathname === '/dashboard') return null;
  const sections: [string, string, string][] = [
    ['/catalog/items', 'Catalog items', '/catalog/items'], ['/catalog', 'Catalog', '/catalog/items'],
    ['/inventory', 'Inventory', '/inventory/overview'], ['/purchases', 'Purchases', '/purchases/overview'],
    ['/suppliers', 'Suppliers', '/suppliers'], ['/brokers', 'Brokers', '/brokers'], ['/settings', 'Settings', '/settings'],
  ];
  const section = sections.find(([prefix]) => pathname === prefix || pathname.startsWith(prefix + '/'));
  const names: Record<string, string> = { categories: 'Categories', types: 'Types', barcodes: 'Barcodes', duplicates: 'Duplicate review', overview: 'Overview', all: 'Stock list', 'low-stock': 'Low stock', 'out-of-stock': 'Out of stock', activity: 'Stock activity', list: 'Purchase orders', new: 'Create', edit: 'Edit', backup: 'Export & backup', help: 'Help', reports: 'Reports', ml: 'Predictions', audit: 'Audit history', notifications: 'Notifications', operations: 'Daily operations', users: 'Users' };
  const end = pathname.split('/').filter(Boolean).at(-1) ?? '';
  const label = names[end] ?? (section ? 'Details' : 'Page not found');
  return <nav aria-label="Breadcrumb" className="mb-4 text-sm text-slate-500"><ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <li><Link className="underline" to="/dashboard">Home</Link></li>
    {section && <><li aria-hidden="true">/</li><li>{pathname === section[2] ? <span aria-current="page">{section[1]}</span> : <Link className="underline" to={section[2]}>{section[1]}</Link>}</li></>}
    {(!section || pathname !== section[2]) && <><li aria-hidden="true">/</li><li aria-current="page">{label}</li></>}
  </ol></nav>;
}
