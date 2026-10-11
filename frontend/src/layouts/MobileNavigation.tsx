import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, Boxes, ShoppingBag, BarChart3, MoreHorizontal, X, Search, LogOut, Settings, BookOpen, Download } from 'lucide-react';
import { BrandIdentity } from '../components/BrandIdentity';
import { NotificationBell } from '../components/NotificationBell';
import { hasPermission } from '../auth/hasPermission';
import type { User } from '../types/auth';
import type { NavItem } from './AppShell';
import { cn } from '../lib/cn';

export function MobileHeader({ businessName }: { businessName?: string }) {
  return <><BrandIdentity businessName={businessName} className="flex-1" logoClassName="h-8 w-9" />
    <div className="flex shrink-0 items-center gap-1"><NotificationBell />
      <NavLink to="/settings" aria-label="Settings" className="mobile-icon-button text-[#475569] hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-[#159A8A]"><Settings aria-hidden="true" className="h-5 w-5" /></NavLink>
    </div></>;
}

interface Props {
  user: User | null;
  items: NavItem[];
  onSearch: () => void;
  onLogout: () => void;
  onSelectBusiness: (id: string) => Promise<void>;
  sessionBusy: boolean;
  sessionError: string;
}

export function MobileNavigation({ user, items, onSearch, onLogout, onSelectBusiness, sessionBusy, sessionError }: Props) {
  const location = useLocation();
  const scope = `${location.key}:${user?.currentBusiness?.businessId ?? ''}`;
  const [openScope, setOpenScope] = useState<string | null>(null);
  const open = openScope === scope;
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const primary = [
    { label: 'Home', to: '/dashboard', prefix: '/dashboard', icon: LayoutDashboard },
    { label: 'Stock', to: '/inventory/all', prefix: '/inventory/', permission: 'stock.view', icon: Boxes },
    { label: 'Purchases', to: '/purchases/list', prefix: '/purchases/', permission: 'purchase.view', icon: ShoppingBag },
    { label: 'Reports', to: '/reports', prefix: '/reports', permission: 'reports.view', icon: BarChart3 },
  ].filter(item => hasPermission(user, item.permission));
  const primaryRoutes = new Set(primary.map(item => item.to));
  const groups = [
    { title: 'Operations', labels: ['Suppliers', 'Brokers', 'Daily Operations'] },
    { title: 'Catalog', labels: ['Catalog'] },
    { title: 'Stock', labels: ['Inventory', 'Predictions'] },
    { title: 'Purchases', labels: ['Purchases'] },
    { title: 'Management', labels: ['Users'] },
  ].map(group => ({ title: group.title, links: items.filter(item => group.labels.includes(item.label)).flatMap(item => item.children
    ? item.children.map(child => ({ ...child, icon: item.icon })) : [{ label: item.label, to: item.to!, icon: item.icon }])
    .filter(item => !primaryRoutes.has(item.to)) }));
  const extras = [
    { label: 'Export & Backup', to: '/settings/backup', icon: <Download className="h-4 w-4" />, permission: 'reports.view' },
    { label: 'How to use this app', to: '/settings/help', icon: <BookOpen className="h-4 w-4" /> },
  ].filter(item => hasPermission(user, item.permission) && (item.to !== '/settings/backup' || ['Owner', 'Admin', 'Manager', 'SuperAdmin'].includes(user?.currentBusiness?.role ?? '')));
  useEffect(() => {
    if (!open) return;
    const triggerElement = trigger.current;
    const background = Array.from(document.querySelectorAll<HTMLElement>('.app-main, .app-header, .mobile-bottom-nav'));
    const previousInert = background.map(element => element.inert);
    background.forEach(element => { element.inert = true; });
    panel.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const handleKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') { setOpenScope(null); return; }
      if (event.key === 'Escape') { event.preventDefault(); setOpenScope(null); }
      if (event.key !== 'Tab') return;
      const controls = panel.current?.querySelectorAll<HTMLElement>('a[href], button:not(:disabled), select:not(:disabled)');
      if (!controls?.length) return;
      const first = controls[0], last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => { window.removeEventListener('keydown', handleKey); background.forEach((element, index) => { element.inert = previousInert[index]; }); if (!document.querySelector('dialog[open]')) triggerElement?.focus(); };
  }, [open]);
  const isPrimaryActive = (prefix: string) => prefix.endsWith('/') ? location.pathname.startsWith(prefix) : location.pathname === prefix;
  const moreActive = !primary.some(item => isPrimaryActive(item.prefix));
  const linkClass = ({ isActive }: { isActive: boolean }) => cn('flex min-h-12 items-center gap-3 rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-[#159A8A]', isActive ? 'bg-emerald-50 font-semibold text-[#0E4F46]' : 'text-[#475569] hover:bg-slate-50');
  return <>
    {open && <div className="mobile-more-layer fixed inset-0 z-40 md:hidden">
      <div className="absolute inset-0 bg-black/30" aria-hidden="true" onClick={() => setOpenScope(null)} />
      <div ref={panel} id="mobile-more" role="dialog" aria-modal="true" aria-labelledby="mobile-more-title" className="mobile-more-panel absolute flex flex-col overflow-hidden rounded-2xl border border-[#E2E8E6] bg-white shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-2"><h2 id="mobile-more-title" className="font-bold text-[#0F172A]">More</h2><button aria-label="Close navigation" onClick={() => setOpenScope(null)} className="mobile-icon-button focus-visible:ring-2 focus-visible:ring-[#159A8A]"><X aria-hidden="true" className="h-5 w-5" /></button></div>
        <div className="overflow-y-auto overscroll-contain p-3">
          <button onClick={() => { setOpenScope(null); onSearch(); }} className="flex min-h-12 w-full items-center gap-3 rounded-lg bg-slate-50 px-3 text-sm focus-visible:ring-2 focus-visible:ring-[#159A8A]" aria-label="Open search"><Search aria-hidden="true" className="h-4 w-4" />Search</button>
          <nav aria-label="More navigation">
            {groups.filter(group => group.links.length).map(group => <section key={group.title} className="mt-4"><h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">{group.title}</h3>{group.links.map(item => <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setOpenScope(null)}>{item.icon}{item.label}</NavLink>)}</section>)}
            <section className="mt-4"><h3 className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-[#64748B]">Resources</h3>{extras.map(item => <NavLink key={item.to} to={item.to} className={linkClass} onClick={() => setOpenScope(null)}>{item.icon}{item.label}</NavLink>)}</section>
          </nav>
          <div className="mt-4 border-t px-3 pt-4 text-sm"><p className="break-words font-medium text-[#0F172A]">{user?.currentBusiness?.businessName}</p><p className="mt-1 break-words">{user?.name} · {user?.currentBusiness?.role}</p>
            {!!user?.businesses.length && user.businesses.length > 1 && <label className="mt-3 block">Business<select aria-label="Business" disabled={sessionBusy} value={user.currentBusiness?.businessId} className="mt-1 min-h-12 w-full rounded-lg border p-2" onChange={e => void onSelectBusiness(e.target.value)}>{user.businesses.map(business => <option key={business.businessId} value={business.businessId}>{business.businessName}</option>)}</select></label>}
            {sessionError && <p role="alert" className="mt-2 text-red-700">{sessionError}</p>}
            <button aria-label="Sign out" disabled={sessionBusy} onClick={onLogout} className="mt-2 flex min-h-12 items-center gap-3 focus-visible:ring-2 focus-visible:ring-[#159A8A]"><LogOut aria-hidden="true" className="h-4 w-4" />Sign out</button>
          </div>
        </div>
      </div>
    </div>}
    <nav aria-label="Mobile navigation" className="mobile-bottom-nav fixed inset-x-0 bottom-0 z-30 flex border-t border-[#E2E8E6] bg-white md:hidden">
      {primary.map(item => { const active = isPrimaryActive(item.prefix); return <Link key={item.to} to={item.to} aria-current={active ? 'page' : undefined} className={cn('mobile-bottom-item', active ? 'bg-emerald-50 font-semibold text-[#0E4F46]' : 'text-[#64748B]')}><item.icon aria-hidden="true" className="h-5 w-5" /><span>{item.label}</span></Link>; })}
      <button ref={trigger} aria-current={moreActive ? 'page' : undefined} aria-expanded={open} aria-controls="mobile-more" aria-haspopup="dialog" onClick={() => setOpenScope(open ? null : scope)} className={cn('mobile-bottom-item', open || moreActive ? 'bg-emerald-50 font-semibold text-[#0E4F46]' : 'text-[#64748B]')}><MoreHorizontal aria-hidden="true" className="h-5 w-5" /><span>More</span></button>
    </nav>
  </>;
}
