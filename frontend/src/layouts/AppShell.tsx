import { useEffect, useState, type ComponentType } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3, BedDouble, Building2, CalendarDays, ClipboardCheck, DoorOpen, FileCheck2, FileText, FlaskConical,
  Home, LayoutDashboard, LogOut, Menu as MenuIcon, Receipt, ShoppingBag, ShoppingCart, Store, User, Users, UtensilsCrossed, X,
} from 'lucide-react';
import { Wordmark } from '../components/Brand';
import { Avatar, Badge, useConfirm } from '../components/ui';
import { useAuth } from '../context/AuthContext';
import { useCart } from '../context/CartContext';
import { cn } from '../utils/cn';
import { displayName, isDemoId } from '../utils/format';

interface NavItem { to: string; label: string; icon: ComponentType<{ className?: string }>; end?: boolean }
interface NavSection { title?: string; items: NavItem[] }

const STUDENT_NAV: NavSection[] = [
  { items: [{ to: '/student', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Campus life',
    items: [
      { to: '/student/hostel', label: 'My Hostel', icon: BedDouble },
      { to: '/student/stores', label: 'Campus Stores', icon: ShoppingBag },
      { to: '/student/orders', label: 'My Orders', icon: Receipt },
    ],
  },
  {
    title: 'Requests',
    items: [
      { to: '/student/outpass', label: 'Outpass', icon: DoorOpen },
      { to: '/student/documents', label: 'Documents', icon: FileText },
      { to: '/student/calendar', label: 'Campus Calendar', icon: CalendarDays },
    ],
  },
  { title: 'Account', items: [{ to: '/student/profile', label: 'Profile', icon: User }] },
];

const ADMIN_NAV: NavSection[] = [
  { items: [{ to: '/admin', label: 'Dashboard', icon: LayoutDashboard, end: true }] },
  {
    title: 'Residence',
    items: [
      { to: '/admin/students', label: 'Students', icon: Users },
      { to: '/admin/hostels', label: 'Hostels & Rooms', icon: Building2 },
      { to: '/admin/allocations', label: 'Room Allocation', icon: Home },
    ],
  },
  {
    title: 'Approvals',
    items: [
      { to: '/admin/outpasses', label: 'Outpass Management', icon: ClipboardCheck },
      { to: '/admin/documents', label: 'Document Verification', icon: FileCheck2 },
    ],
  },
  {
    title: 'Services',
    items: [
      { to: '/admin/stores', label: 'Campus Stores', icon: Store },
      { to: '/admin/menu', label: 'Menu Management', icon: UtensilsCrossed },
      { to: '/admin/calendar', label: 'Calendar Management', icon: CalendarDays },
    ],
  },
  {
    title: 'Database',
    items: [
      { to: '/admin/reports', label: 'Reports & Analytics', icon: BarChart3 },
      { to: '/admin/integrity', label: 'Integrity Lab', icon: FlaskConical },
    ],
  },
];

function Sidebar({ sections, onNavigate }: { sections: NavSection[]; onNavigate?: () => void }) {
  const { user, logout } = useAuth();
  const confirm = useConfirm();
  const navigate = useNavigate();
  const doLogout = async () => {
    if (await confirm({ title: 'Sign out?', message: 'You will need to sign in again to continue.', confirmText: 'Sign out' })) {
      await logout();
      navigate('/login', { replace: true });
    }
  };
  return (
    <div className="flex h-full flex-col bg-navy-900 text-slate-300">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Wordmark light />
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 py-4 scrollbar-thin">
        {sections.map((s, i) => (
          <div key={i}>
            {s.title && <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wider text-slate-500 uppercase">{s.title}</p>}
            <ul className="space-y-0.5">
              {s.items.map((it) => (
                <li key={it.to}>
                  <NavLink
                    to={it.to}
                    end={it.end}
                    onClick={onNavigate}
                    className={({ isActive }) => cn(
                      'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] font-medium transition',
                      isActive ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-slate-100',
                    )}
                  >
                    {({ isActive }) => (
                      <>
                        {isActive && <span className="absolute top-1.5 bottom-1.5 left-0 w-0.5 rounded-full bg-brand-400" />}
                        <it.icon className={cn('size-4.5 shrink-0', isActive ? 'text-brand-300' : 'text-slate-500 group-hover:text-slate-300')} />
                        {it.label}
                      </>
                    )}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>
      <div className="border-t border-white/10 p-3">
        <div className="flex items-center gap-3 rounded-xl px-2 py-2">
          <Avatar name={user?.name} size="md" className="ring-2 ring-white/10" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-semibold text-white">{displayName(user?.name)}</p>
            <p className="truncate text-[11px] text-slate-400">{user?.role === 'student' ? user.sub : user?.email}</p>
          </div>
          <button onClick={doLogout} title="Sign out" aria-label="Sign out"
            className="focus-ring rounded-lg p-2 text-slate-400 transition hover:bg-white/10 hover:text-white">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function CartButton() {
  const cart = useCart();
  const navigate = useNavigate();
  return (
    <button
      onClick={() => navigate('/student/stores?cart=1')}
      className="focus-ring relative flex h-9 items-center gap-2 rounded-lg bg-white px-3 text-[13px] font-medium text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50"
    >
      <ShoppingCart className="size-4 text-slate-500" />
      <span className="hidden sm:inline">Cart</span>
      {cart.count > 0 && (
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white tabular">{cart.count}</span>
      )}
    </button>
  );
}

export function AppShell({ role }: { role: 'student' | 'admin' }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const sections = role === 'student' ? STUDENT_NAV : ADMIN_NAV;
  useEffect(() => { setOpen(false); }, [location.pathname]);
  useEffect(() => { window.scrollTo({ top: 0 }); }, [location.pathname]);

  return (
    <div className="min-h-screen">
      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 lg:block">
        <Sidebar sections={sections} />
      </aside>
      {/* mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-72 animate-pop-in">
            <Sidebar sections={sections} onNavigate={() => setOpen(false)} />
            <button className="absolute top-4 -right-11 rounded-lg bg-white/10 p-2 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="size-5" />
            </button>
          </div>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200/70 bg-white/80 px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <button className="focus-ring -ml-1 rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
            <MenuIcon className="size-5" />
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] text-slate-500">
              {role === 'student' ? 'Student portal' : 'Administration'}
              <span className="mx-2 text-slate-300">/</span>
              <span className="font-medium text-slate-800">
                {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
              </span>
            </p>
          </div>
          {role === 'student' && user && isDemoId(user.sub) && <Badge tone="violet" className="hidden md:inline-flex">Synthetic demo account</Badge>}
          {role === 'admin' && <Badge tone="navy" className="hidden md:inline-flex">Admin</Badge>}
          {role === 'student' && <CartButton />}
        </header>
        <main className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
