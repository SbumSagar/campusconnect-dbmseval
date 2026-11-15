import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DataTable, Pagination, StatusBadge } from '../components/ui';
import { ApiError } from '../services/api';

// ---- mock the API layer used by the auth context and the login page
// A plain function (not vi.fn) so a rejected login is not reported by vitest's mock tracking.
let loginImpl: (...a: unknown[]) => Promise<unknown> = async () => undefined;
const loginCalls: unknown[][] = [];
const login = {
  mockReset: () => { loginImpl = async () => undefined; loginCalls.length = 0; },
  mockImplementation: (f: (...a: unknown[]) => Promise<unknown>) => { loginImpl = f; },
  mockResolvedValue: (v: unknown) => { loginImpl = async () => v; },
};
vi.mock('../services/endpoints', () => ({
  authApi: {
    me: vi.fn(() => Promise.reject(new Error('no session'))),
    login: (...a: unknown[]) => { loginCalls.push(a); return loginImpl(...a); },
    logout: vi.fn(() => Promise.resolve()),
    demoAccounts: vi.fn(() => Promise.resolve({ students: [{ student_id: 'DEMO1', full_name: 'Demo One', gender: 'MALE' }], admins: [] })),
  },
}));

const { AuthProvider } = await import('../context/AuthContext');
const { default: Login } = await import('../pages/auth/Login');

function renderLogin() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/student" element={<p>student home</p>} />
            <Route path="/admin" element={<p>admin home</p>} />
          </Routes>
        </AuthProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('Login page', () => {
  beforeEach(() => login.mockReset());

  it('validates empty fields before calling the API', async () => {
    renderLogin();
    await userEvent.click(await screen.findByRole('button', { name: /Sign in as student/ }));
    expect(screen.getByRole('alert')).toHaveTextContent(/student ID and password/);
    expect(loginCalls).toHaveLength(0);
  });

  it('shows the server error for bad credentials', async () => {
    login.mockImplementation(async () => { throw new ApiError(401, { code: 'UNAUTHORIZED', message: 'Incorrect ID / e-mail or password' }); });
    renderLogin();
    await userEvent.type(await screen.findByLabelText('Student ID'), 'DEMO1');
    await userEvent.type(screen.getByLabelText('Password'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: /Sign in as student/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Incorrect ID / e-mail or password');
  });

  it('signs an administrator in and routes to the admin area', async () => {
    login.mockResolvedValue({ sub: '1', role: 'admin', name: 'Admin', email: 'a@x.invalid', adminId: 1 });
    renderLogin();
    await userEvent.click(await screen.findByRole('tab', { name: /Administrator/ }));
    await userEvent.type(screen.getByLabelText('Admin e-mail'), 'a@x.invalid');
    await userEvent.type(screen.getByLabelText('Password'), 'pw');
    await userEvent.click(screen.getByRole('button', { name: /Sign in as administrator/ }));
    await waitFor(() => expect(screen.getByText('admin home')).toBeInTheDocument());
    expect(loginCalls).toEqual([['admin', 'a@x.invalid', 'pw']]);
  });

  it('fills a demo identity when its chip is clicked', async () => {
    renderLogin();
    await userEvent.click(await screen.findByRole('button', { name: 'Demo One' }));
    expect(screen.getByLabelText('Student ID')).toHaveValue('DEMO1');
  });
});

describe('UI kit', () => {
  it('StatusBadge labels every schema status', () => {
    render(<div><StatusBadge status="APPROVED" /><StatusBadge status="CANCELLED" /><StatusBadge status="VERIFIED" /></div>);
    expect(screen.getByText('Approved')).toBeInTheDocument();
    expect(screen.getByText('Cancelled')).toBeInTheDocument();
    expect(screen.getByText('Verified')).toBeInTheDocument();
  });

  it('DataTable renders rows, empty state and row clicks', async () => {
    const onRow = vi.fn();
    const cols = [{ key: 'name', header: 'Name' }, { key: 'qty', header: 'Qty', align: 'right' as const }];
    const { rerender } = render(<DataTable columns={cols} rows={[{ name: 'Dosa', qty: 2 }]} rowKey={(r) => r.name} onRowClick={onRow} />);
    await userEvent.click(screen.getByText('Dosa'));
    expect(onRow).toHaveBeenCalledWith({ name: 'Dosa', qty: 2 });
    rerender(<DataTable columns={cols} rows={[]} rowKey={(r: { name: string }) => r.name} />);
    expect(screen.getByText('Nothing here yet')).toBeInTheDocument();
  });

  it('Pagination shows the range and moves between pages', async () => {
    const onPage = vi.fn();
    render(<Pagination page={2} pages={5} total={95} pageSize={20} onPage={onPage} />);
    expect(screen.getByText('21–40')).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Next page'));
    expect(onPage).toHaveBeenCalledWith(3);
  });
});
