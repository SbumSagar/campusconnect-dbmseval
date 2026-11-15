import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { LoadingBlock } from './components/ui';
import { useAuth } from './context/AuthContext';
import { AppShell } from './layouts/AppShell';
import Login from './pages/auth/Login';
import NotFound from './pages/NotFound';
import type { Role } from './types';

// Student pages
const StudentDashboard = lazy(() => import('./pages/student/Dashboard'));
const StudentHostel = lazy(() => import('./pages/student/Hostel'));
const StudentStores = lazy(() => import('./pages/student/Stores'));
const StudentOrders = lazy(() => import('./pages/student/Orders'));
const StudentOrderDetail = lazy(() => import('./pages/student/OrderDetail'));
const StudentOutpass = lazy(() => import('./pages/student/Outpass'));
const StudentDocuments = lazy(() => import('./pages/student/Documents'));
const StudentProfile = lazy(() => import('./pages/student/Profile'));
const CalendarPage = lazy(() => import('./pages/shared/CalendarPage'));

// Admin pages
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminStudents = lazy(() => import('./pages/admin/Students'));
const AdminStudentDetail = lazy(() => import('./pages/admin/StudentDetail'));
const AdminHostels = lazy(() => import('./pages/admin/Hostels'));
const AdminHostelDetail = lazy(() => import('./pages/admin/HostelDetail'));
const AdminAllocations = lazy(() => import('./pages/admin/Allocations'));
const AdminOutpasses = lazy(() => import('./pages/admin/Outpasses'));
const AdminDocuments = lazy(() => import('./pages/admin/Documents'));
const AdminStores = lazy(() => import('./pages/admin/Stores'));
const AdminMenu = lazy(() => import('./pages/admin/Menu'));
const AdminReports = lazy(() => import('./pages/admin/Reports'));
const AdminIntegrity = lazy(() => import('./pages/admin/IntegrityLab'));

function RequireRole({ role, children }: { role: Role; children: ReactNode }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <LoadingBlock className="min-h-screen" label="Checking your session…" />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (user.role !== role) return <Navigate to={user.role === 'admin' ? '/admin' : '/student'} replace />;
  return <>{children}</>;
}

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <LoadingBlock className="min-h-screen" />;
  return <Navigate to={!user ? '/login' : user.role === 'admin' ? '/admin' : '/student'} replace />;
}

const page = (el: ReactNode) => <Suspense fallback={<LoadingBlock />}>{el}</Suspense>;

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />

      <Route path="/student" element={<RequireRole role="student"><AppShell role="student" /></RequireRole>}>
        <Route index element={page(<StudentDashboard />)} />
        <Route path="hostel" element={page(<StudentHostel />)} />
        <Route path="stores" element={page(<StudentStores />)} />
        <Route path="orders" element={page(<StudentOrders />)} />
        <Route path="orders/:id" element={page(<StudentOrderDetail />)} />
        <Route path="outpass" element={page(<StudentOutpass />)} />
        <Route path="documents" element={page(<StudentDocuments />)} />
        <Route path="calendar" element={page(<CalendarPage editable={false} />)} />
        <Route path="profile" element={page(<StudentProfile />)} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="/admin" element={<RequireRole role="admin"><AppShell role="admin" /></RequireRole>}>
        <Route index element={page(<AdminDashboard />)} />
        <Route path="students" element={page(<AdminStudents />)} />
        <Route path="students/:id" element={page(<AdminStudentDetail />)} />
        <Route path="hostels" element={page(<AdminHostels />)} />
        <Route path="hostels/:name" element={page(<AdminHostelDetail />)} />
        <Route path="allocations" element={page(<AdminAllocations />)} />
        <Route path="outpasses" element={page(<AdminOutpasses />)} />
        <Route path="documents" element={page(<AdminDocuments />)} />
        <Route path="stores" element={page(<AdminStores />)} />
        <Route path="menu" element={page(<AdminMenu />)} />
        <Route path="calendar" element={page(<CalendarPage editable />)} />
        <Route path="reports" element={page(<AdminReports />)} />
        <Route path="integrity" element={page(<AdminIntegrity />)} />
        <Route path="*" element={<NotFound />} />
      </Route>

      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
