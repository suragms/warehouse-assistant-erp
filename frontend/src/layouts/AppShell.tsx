import { Breadcrumbs } from '../components/Breadcrumbs';
import { ThemeToggle } from '../components/ThemeProvider';
import { RealtimeUpdates } from '../components/RealtimeUpdates';
import { BackupReminder } from '../components/BackupReminder';
import React, { useState } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Package, Users, Truck,
  ChevronDown, ChevronRight, LogOut, Search,
  Boxes, Building2, ShoppingBag, BarChart3, Bell
} from 'lucide-react';
import { useAuthStore } from '../stores/authStore';
import { hasPermission } from '../auth/hasPermission';
import { cn } from '../lib/cn';
import { GlobalSearch } from '../components/search/GlobalSearch';
import apiClient from '../api/apiClient';
import type { AuthResponse, User } from '../types/auth';
import { purchaseErrorMessage } from '../lib/purchaseValidation';
import { BrandIdentity, BrandLoading } from '../components/BrandIdentity';
import { MobileHeader, MobileNavigation } from './MobileNavigation';
import { useMobileViewport } from './useMobileViewport';

export interface NavItem {
  label: string;
  icon: React.ReactNode;
  to?: string;
  permission?: string;
  children?: { label: string; to: string; permission?: string }[];
}

const navItems: NavItem[] = [
  { label: 'Dashboard', icon: <LayoutDashboard className="h-4 w-4" />, to: '/dashboard' },
  { label: 'Reports', permission: 'reports.view', icon: <BarChart3 className="h-4 w-4" />, to: '/reports' },
  { label: 'Predictions', permission: 'stock.view', icon: <BarChart3 className="h-4 w-4" />, to: '/ml' },
  { label: 'Notifications', icon: <Bell className="h-4 w-4" />, to: '/notifications' },
  {
    label: 'Catalog', permission: 'catalog.view', icon: <Package className="h-4 w-4" />, children: [
      { label: 'Items', to: '/catalog/items' },
      { label: 'Categories', to: '/catalog/categories' },
      { label: 'Types', to: '/catalog/types' },
      { label: 'Barcodes', to: '/catalog/barcodes' },
      { label: 'Duplicates', to: '/catalog/duplicates', permission: 'catalog.edit' },
    ]
  },
  { label: 'Suppliers', permission: 'supplier.view', icon: <Truck className="h-4 w-4" />, to: '/suppliers' },
  { label: 'Brokers', permission: 'broker.view', icon: <Building2 className="h-4 w-4" />, to: '/brokers' },
  {
    label: 'Inventory', permission: 'stock.view', icon: <Boxes className="h-4 w-4" />, children: [
      { label: 'Overview', to: '/inventory/overview' },
      { label: 'Stock List', to: '/inventory/all' },
      { label: 'Low Stock', to: '/inventory/low-stock' },
      { label: 'Out of Stock', to: '/inventory/out-of-stock' },
    ]
  },
  {
    label: 'Purchases', permission: 'purchase.view', icon: <ShoppingBag className="h-4 w-4" />, children: [
      { label: 'Overview', to: '/purchases/overview' },
      { label: 'All Purchases', to: '/purchases/list' },
      { label: 'New Purchase', to: '/purchases/new', permission: 'purchase.create' },
    ]
  },
  { label: 'Daily Operations', icon: <Boxes className="h-4 w-4" />, to: '/operations' },
  { label: 'Settings', icon: <Building2 className="h-4 w-4" />, to: '/settings' },
  { label: 'Users', permission: 'users.view', icon: <Users className="h-4 w-4" />, to: '/users' },
];

const SidebarNavItem: React.FC<{ item: NavItem; onNavigate?: () => void }> = ({ item, onNavigate }) => {
  const location = useLocation();
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const open = expanded ?? !!item.children?.some(child => location.pathname === child.to || location.pathname.startsWith(child.to + '/'));

  if (item.children) {
    return (
      <div>
        <button
          aria-expanded={open} onClick={() => setExpanded(!open)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg text-sm text-[#E2E8E6] hover:bg-white/10 transition-colors"
        >
          <span className="flex items-center gap-2">
            {item.icon}
            {item.label}
          </span>
          {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        </button>
        {open && (
          <div className="ml-6 mt-0.5 flex flex-col gap-0.5">
            {item.children.map((child) => (
              <NavLink
                key={child.to}
                to={child.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cn(
                    'px-3 py-1.5 rounded-lg text-sm transition-colors',
                    isActive
                      ? 'bg-white/20 text-white font-medium'
                      : 'text-[#B8D4CF] hover:bg-white/10 hover:text-white'
                  )
                }
              >
                {child.label}
              </NavLink>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <NavLink
      to={item.to!}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors',
          isActive
            ? 'bg-white/20 text-white font-medium'
            : 'text-[#B8D4CF] hover:bg-white/10 hover:text-white'
        )
      }
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
};

interface AppSidebarProps {
  user: User | null;
  mobile?: boolean;
  sessionBusy: boolean;
  sessionError: string;
  onSelectBusiness: (businessId: string) => Promise<void>;
  onLogout: () => void;
}

const AppSidebar: React.FC<AppSidebarProps> = ({ user, mobile = false, sessionBusy, sessionError, onSelectBusiness, onLogout }) => (
  <div className={cn('flex flex-col h-full', mobile ? 'w-72' : 'w-64')}>
    <div className={cn('px-4 py-5 border-b border-white/10 shrink-0', mobile && 'pr-10')}>
      <BrandIdentity inverse logoClassName="h-8 w-10" />
    </div>
    {user?.currentBusiness && (
      <div className="px-4 py-2 border-b border-white/10">
        <p className="text-xs text-[#8FC4BC]">Business</p>
        <p className="text-sm font-medium text-white truncate">{user.currentBusiness.businessName}</p>
        {user.businesses.length > 1 && <select aria-label="Business" disabled={sessionBusy} value={user.currentBusiness.businessId}
          className="mt-2 w-full rounded border border-white/20 bg-[#0E4F46] text-sm text-white p-2" onChange={e => void onSelectBusiness(e.target.value)}>
          {user.businesses.map(b => <option key={b.businessId} value={b.businessId}>{b.businessName}</option>)}
        </select>}
        {sessionError && <p role="alert" className="mt-2 text-sm text-red-200">{sessionError}</p>}
      </div>
    )}
    <nav className="flex-1 overflow-y-auto px-3 py-4 flex flex-col gap-1" aria-label="Main navigation">
      {navItems.filter(item => hasPermission(user, item.permission)).map(item => ({ ...item, children: item.children?.filter(child => hasPermission(user, child.permission)) })).map(item => (
        <SidebarNavItem key={item.label} item={item} />
      ))}
    </nav>
    <div className="border-t border-white/10 px-4 py-3 flex items-center gap-3">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-white truncate">{user?.name}</p>
        <p className="text-xs text-[#8FC4BC] truncate">{user?.currentBusiness?.role}</p>
      </div>
      <button onClick={onLogout} disabled={sessionBusy} className="text-[#8FC4BC] hover:text-white transition-colors" aria-label="Sign out">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  </div>
);

export const AppShell: React.FC = () => {
  const mobile = useMobileViewport();
  const [searchOpen, setSearchOpen] = useState(false);
  const { user, logout, setSession } = useAuthStore();
  const [sessionBusy, setSessionBusy] = useState(false);
  const [sessionError, setSessionError] = useState('');
  const sessionRequest = React.useRef(false);
  const navigate = useNavigate();
  const visibleItems = navItems.map(item => ({ ...item, children: item.children?.filter(child =>
    hasPermission(user, child.to === '/catalog/duplicates' ? 'catalog.edit' : child.permission ?? item.permission)) }))
    .filter(item => item.children ? item.children.length > 0 : hasPermission(user, item.permission));

  const handleLogout = async () => {
    if (sessionRequest.current) return;
    sessionRequest.current = true; setSessionBusy(true); setSessionError('');
    try { await apiClient.post('/auth/logout'); logout(); navigate('/login'); }
    catch (error) { setSessionError(purchaseErrorMessage(error)); }
    finally { sessionRequest.current = false; setSessionBusy(false); }
  };

  const selectBusiness = async (businessId: string) => {
    if (sessionRequest.current || businessId === user?.currentBusiness?.businessId) return;
    sessionRequest.current = true; setSessionBusy(true); setSessionError('');
    try {
      const { data } = await apiClient.post<AuthResponse>('/auth/select-business', { businessId });
      setSession(data.data.accessToken, data.data.user); navigate('/dashboard');
    } catch (error) { setSessionError(purchaseErrorMessage(error)); }
    finally { sessionRequest.current = false; setSessionBusy(false); }
  };

  // Global Ctrl+K / Cmd+K shortcut
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return (
    <div className="app-shell flex h-screen bg-[#F7F9F6] overflow-hidden"><RealtimeUpdates />
      {/* Desktop Sidebar */}
      <div className="hidden md:flex flex-col bg-[#0E4F46] shrink-0">
        <AppSidebar user={user} sessionBusy={sessionBusy} sessionError={sessionError} onSelectBusiness={selectBusiness} onLogout={handleLogout} />
      </div>

      <a className="skip-link" href="#main-content">Skip to main content</a>
      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="app-header h-14 bg-white border-b border-[#E2E8E6] flex items-center gap-3 px-4 shrink-0">
          {mobile && <MobileHeader businessName={user?.currentBusiness?.businessName} />}

          {/* Search trigger */}
          <button
            onClick={() => setSearchOpen(true)}
            className="hidden md:flex items-center gap-2 shrink-0 md:flex-1 md:max-w-md text-left text-sm text-gray-400 bg-gray-50 border border-[#E2E8E6] rounded-lg px-3 py-1.5 hover:border-[#159A8A] transition-colors focus:outline-none focus:ring-2 focus:ring-[#159A8A]"
            aria-label="Open search"
          >
            <Search className="h-4 w-4 shrink-0" />
            <span className="hidden md:block flex-1">Search…</span>
            <kbd className="hidden md:inline-flex text-xs bg-white border border-gray-200 rounded px-1.5 py-0.5 text-gray-400">
              ⌘K
            </kbd>
          </button>

          <div className="hidden md:flex ml-auto min-w-0 items-center gap-2">
            <span title={user?.name} className="hidden sm:block max-w-40 truncate text-sm text-[#475569] font-medium">{user?.name}</span>
          </div>
          <ThemeToggle />
        </header>

        {/* Page content */}
        <main id="main-content" tabIndex={-1} className="app-main flex-1 min-w-0 min-h-0 overflow-y-auto">
          <div className="app-content max-w-screen-2xl mx-auto px-4 sm:px-6 py-5">
            <React.Suspense
              fallback={
                <div className="flex items-center justify-center py-24">
                  <BrandLoading />
                </div>
              }
            >
              <BackupReminder key={`${user?.id ?? ''}:${user?.currentBusiness?.businessId ?? ''}`} /><Breadcrumbs /><Outlet />
            </React.Suspense>
          </div>
        </main>
      </div>
      {mobile && <MobileNavigation user={user} items={visibleItems} onSearch={() => setSearchOpen(true)} onLogout={() => void handleLogout()} onSelectBusiness={selectBusiness} sessionBusy={sessionBusy} sessionError={sessionError} />}

      {/* Global Search modal */}
      <GlobalSearch key={searchOpen ? 'open' : 'closed'} open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
};
