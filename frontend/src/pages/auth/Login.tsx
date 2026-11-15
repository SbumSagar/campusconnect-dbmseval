import { useState, type FormEvent } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, BedDouble, ClipboardCheck, DoorOpen, Eye, EyeOff, GraduationCap, Lock, ShieldCheck, ShoppingBag, UserRound } from 'lucide-react';
import { LogoMark, Wordmark } from '../../components/Brand';
import { Button, Field, Input } from '../../components/ui';
import { useAuth } from '../../context/AuthContext';
import { useTitle } from '../../hooks';
import { ApiError } from '../../services/api';
import { authApi } from '../../services/endpoints';
import type { Role } from '../../types';
import { cn } from '../../utils/cn';

const FEATURES = [
  { icon: BedDouble, title: 'Hostel & rooms', text: 'Allocation history and live occupancy for all six hostels.' },
  { icon: ShoppingBag, title: 'Campus stores', text: 'Order from canteens and stores with trigger-maintained totals.' },
  { icon: DoorOpen, title: 'Outpasses', text: 'Request, review and close outpasses with full audit trail.' },
  { icon: ClipboardCheck, title: 'Documents', text: 'Upload certificates and track verification status.' },
];

export default function Login() {
  useTitle('Sign in');
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [role, setRole] = useState<Role>('student');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const demo = useQuery({ queryKey: ['demo-accounts'], queryFn: authApi.demoAccounts, staleTime: Infinity });

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError(role === 'student' ? 'Enter your student ID and password.' : 'Enter your e-mail and password.');
      return;
    }
    setBusy(true);
    try {
      const u = await login(role, identifier, password);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from && from.startsWith(`/${u.role}`) ? from : u.role === 'admin' ? '/admin' : '/student', { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign in');
    } finally {
      setBusy(false);
    }
  };

  const switchRole = (r: Role) => {
    setRole(r);
    setIdentifier('');
    setError(null);
  };

  const suggestions = role === 'student'
    ? demo.data?.students.slice(0, 6).map((s) => ({ id: s.student_id, label: s.full_name }))
    : demo.data?.admins.slice(0, 4).map((a) => ({ id: a.email, label: a.role }));

  return (
    <div className="grid min-h-screen bg-white lg:grid-cols-[1.05fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-navy-900 lg:flex lg:flex-col">
        <div className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, white 1px, transparent 0)', backgroundSize: '22px 22px' }} />
        <div className="pointer-events-none absolute -top-40 -right-40 size-[520px] rounded-full bg-brand-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-48 -left-32 size-[420px] rounded-full bg-sky-500/20 blur-3xl" />
        <div className="relative flex flex-1 flex-col px-14 py-12">
          <Wordmark light />
          <div className="mt-auto max-w-lg">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-brand-200 ring-1 ring-white/15">
              <GraduationCap className="size-3.5" /> Student Welfare Division portal
            </span>
            <h1 className="mt-5 text-4xl leading-[1.15] font-semibold tracking-tight text-white">
              Everything about campus life,<br />in one place.
            </h1>
            <p className="mt-4 text-[15px] leading-relaxed text-slate-300">
              Rooms, food, outpasses, documents and the academic calendar - backed by one relational database
              where the rules are enforced by PostgreSQL itself.
            </p>
            <div className="mt-10 grid grid-cols-2 gap-4">
              {FEATURES.map((f) => (
                <div key={f.title} className="rounded-2xl bg-white/[0.06] p-4 ring-1 ring-white/10 backdrop-blur-sm">
                  <f.icon className="size-5 text-brand-300" />
                  <p className="mt-3 text-sm font-semibold text-white">{f.title}</p>
                  <p className="mt-1 text-[13px] leading-snug text-slate-400">{f.text}</p>
                </div>
              ))}
            </div>
          </div>
          <p className="mt-12 text-xs text-slate-500">CampusConnect · DBMS course project · Group 15</p>
        </div>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-5 py-12 sm:px-10">
        <div className="w-full max-w-[400px]">
          <div className="mb-8 lg:hidden"><Wordmark /></div>
          <div className="mb-8">
            <LogoMark className="hidden size-11 lg:block" />
            <h2 className="mt-5 text-2xl font-semibold tracking-tight text-navy-900">Welcome back</h2>
            <p className="mt-1.5 text-sm text-slate-500">Sign in to continue to CampusConnect.</p>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="tablist" aria-label="Sign in as">
            {([['student', 'Student', UserRound], ['admin', 'Administrator', ShieldCheck]] as const).map(([r, label, Icon]) => (
              <button
                key={r}
                type="button"
                role="tab"
                aria-selected={role === r}
                onClick={() => switchRole(r)}
                className={cn(
                  'focus-ring flex items-center justify-center gap-2 rounded-lg py-2 text-sm font-medium transition',
                  role === r ? 'bg-white text-navy-900 shadow-sm' : 'text-slate-500 hover:text-slate-800',
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-4" noValidate>
            <Field label={role === 'student' ? 'Student ID' : 'Admin e-mail'} htmlFor="identifier">
              <Input
                id="identifier"
                autoComplete="username"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                placeholder={role === 'student' ? 'e.g. DEMO2023A7PS001H' : 'name@campusconnect.invalid'}
                leading={<UserRound className="size-4" />}
                className="h-11"
              />
            </Field>
            <Field label="Password" htmlFor="password">
              <div className="relative">
                <Input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  leading={<Lock className="size-4" />}
                  className="h-11 pr-10"
                />
                <button type="button" onClick={() => setShow((s) => !s)} aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute top-1/2 right-2.5 -translate-y-1/2 rounded-md p-1 text-slate-400 hover:text-slate-700">
                  {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
            </Field>
            {error && (
              <div role="alert" className="rounded-lg bg-rose-50 px-3.5 py-2.5 text-[13px] font-medium text-rose-700 ring-1 ring-rose-200">{error}</div>
            )}
            <Button type="submit" size="lg" className="w-full" loading={busy} iconRight={<ArrowRight className="size-4" />}>
              Sign in as {role === 'student' ? 'student' : 'administrator'}
            </Button>
          </form>

          {!!suggestions?.length && (
            <div className="mt-8 rounded-2xl border border-dashed border-slate-200 bg-slate-50/60 p-4">
              <p className="text-xs font-semibold tracking-wide text-slate-500 uppercase">Demo accounts</p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {suggestions.map((s) => (
                  <button key={s.id} type="button" onClick={() => setIdentifier(s.id)} title={s.id}
                    className="rounded-lg bg-white px-2.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200 transition hover:text-brand-700 hover:ring-brand-300">
                    {s.label}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-[12px] leading-relaxed text-slate-500">
                Synthetic demonstration identities. Passwords are configured in <code className="font-mono text-[11px]">.env</code> (see README).
                Demo authentication only - not production-grade.
              </p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
