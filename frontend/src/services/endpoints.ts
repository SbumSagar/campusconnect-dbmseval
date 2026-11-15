import { http } from './api';
import type {
  AdminDashboard, Allocation, AuditResult, CalendarEntry, DbCatalog, DocumentRow, Hostel, IntegrityResult,
  IntegrityTest, MenuItem, OrderDetail, OrderStatus, OrderSummary, Outpass, OutpassCounts, Page, ReportMeta,
  ReportResult, Room, SessionUser, Store, Student, StudentDashboard, VerifyStatus,
} from '../types';

type Params = Record<string, string | number | boolean | undefined | null>;
const clean = (p: Params = {}) =>
  Object.fromEntries(Object.entries(p).filter(([, v]) => v !== undefined && v !== null && v !== ''));
const get = <T,>(url: string, params?: Params) => http.get<T>(url, { params: clean(params) }).then((r) => r.data);
const post = <T,>(url: string, body?: unknown, params?: Params) =>
  http.post<T>(url, body, { params: clean(params) }).then((r) => r.data);
const patch = <T,>(url: string, body?: unknown) => http.patch<T>(url, body).then((r) => r.data);
const put = <T,>(url: string, body?: unknown, params?: Params) =>
  http.put<T>(url, body, { params: clean(params) }).then((r) => r.data);
const del = (url: string, params?: Params) => http.delete(url, { params: clean(params) }).then(() => undefined);
const enc = encodeURIComponent;

export const authApi = {
  login: (role: 'student' | 'admin', identifier: string, password: string) =>
    post<{ user: SessionUser }>('/auth/login', { role, identifier, password }).then((r) => r.user),
  logout: () => post('/auth/logout'),
  me: () => get<{ user: SessionUser }>('/auth/me').then((r) => r.user),
  demoAccounts: () => get<{ students: { student_id: string; full_name: string; gender: string }[]; admins: { email: string; full_name: string; role: string }[] }>('/auth/demo-accounts'),
};

export const studentApi = {
  me: () => get<Student>('/students/me'),
  dashboard: () => get<StudentDashboard>('/students/me/dashboard'),
  allocations: () => get<{ current: Student; history: Allocation[]; roommates: { student_id: string; full_name: string }[] }>('/students/me/allocations'),
  spend: () => get<{ order_count: number; computed_spend: number; stored_spend: number; is_consistent: boolean; byStore: { store_name: string; orders: number; spend: number }[] }>('/students/me/spend'),
  updateMe: (body: { phone: string | null }) => patch<Student>('/students/me', body),
  // admin
  list: (p: Params) => get<Page<Student>>('/students', p),
  detail: (id: string) => get<{ profile: Student; allocations: Allocation[]; orders: OrderSummary[]; outpasses: Outpass[]; documents: DocumentRow[] }>(`/students/${enc(id)}`),
  create: (body: Partial<Student>) => post<Student>('/students', body),
  update: (id: string, body: Partial<Student>) => patch<Student>(`/students/${enc(id)}`, body),
  remove: (id: string) => del(`/students/${enc(id)}`),
};

export const hostelApi = {
  list: () => get<Hostel[]>('/hostels'),
  get: (name: string) => get<Hostel>(`/hostels/${enc(name)}`),
  update: (name: string, body: { hostel_type?: string; warden_name?: string | null }) => patch<Hostel>(`/hostels/${enc(name)}`, body),
};

export const roomApi = {
  list: (p: Params) => get<Page<Room>>('/rooms', p),
  get: (hostel: string, room: string) => get<Room & { allocations: Allocation[] }>(`/rooms/${enc(hostel)}/${enc(room)}`),
  available: (student: string, hostel?: string, q?: string) => get<Room[]>('/rooms/available', { student, hostel, q }),
  create: (body: { hostel_name: string; room_no: string; floor_no: number }) => post<Room>('/rooms', body),
  update: (hostel: string, room: string, body: { room_no?: string; floor_no?: number }) => patch<Room>(`/rooms/${enc(hostel)}/${enc(room)}`, body),
  remove: (hostel: string, room: string) => del(`/rooms/${enc(hostel)}/${enc(room)}`),
};

export interface RoomSnapshot { hostel_name: string; room_no: string; occupancy: number }

export const allocationApi = {
  recent: (limit = 25) => get<Allocation[]>('/allocations/recent', { limit }),
  history: (studentId: string) => get<Allocation[]>(`/allocations/student/${enc(studentId)}`),
  allocate: (body: { student_id: string; hostel_name: string; room_no: string; date?: string }) =>
    post<{ allocation: Allocation; room: RoomSnapshot }>('/allocations', body),
  transfer: (body: { student_id: string; hostel_name: string; room_no: string; date?: string }) =>
    post<{ ended: Allocation; created: Allocation; before: { from: RoomSnapshot; to: RoomSnapshot }; after: { from: RoomSnapshot; to: RoomSnapshot } }>('/allocations/transfer', body),
  vacate: (body: { student_id: string; date?: string }) => post<{ ended: Allocation; room: RoomSnapshot }>('/allocations/vacate', body),
};

export const storeApi = {
  list: () => get<Store[]>('/stores'),
  get: (name: string) => get<Store>(`/stores/${enc(name)}`),
  create: (body: Store) => post<Store>('/stores', body),
  update: (name: string, body: Omit<Store, 'store_name'>) => put<Store>(`/stores/${enc(name)}`, body),
  remove: (name: string) => del(`/stores/${enc(name)}`),
};

export const menuApi = {
  list: (p: Params) => get<Page<MenuItem>>('/menu', p),
  categories: (store?: string) => get<string[]>('/menu/categories', { store }),
  create: (store: string, body: Omit<MenuItem, 'store_name'>) => post<MenuItem>(`/menu/${enc(store)}`, body),
  update: (store: string, item: string, body: Partial<MenuItem>) => patch<MenuItem>(`/menu/${enc(store)}/${enc(item)}`, body),
  remove: (store: string, item: string) => del(`/menu/${enc(store)}/${enc(item)}`),
};

export interface SpendChange { before: number; after: number; student_id?: string }

export const orderApi = {
  place: (store_name: string, items: { item_name: string; quantity: number }[]) =>
    post<{ order: OrderDetail; spend: SpendChange }>('/orders', { store_name, items }),
  list: (p: Params) => get<Page<OrderSummary>>('/orders', p),
  get: (id: number) => get<OrderDetail>(`/orders/${id}`),
  cancel: (id: number) => post<{ order: OrderDetail; spend: SpendChange }>(`/orders/${id}/cancel`),
  setStatus: (id: number, status: OrderStatus) =>
    patch<{ order: OrderSummary; previousStatus: OrderStatus; spend: SpendChange }>(`/orders/${id}/status`, { status }),
};

export const outpassApi = {
  create: (body: { reason: string; out_at: string; return_by: string }) => post<Outpass>('/outpasses', body),
  list: (p: Params) => get<Page<Outpass>>('/outpasses', p),
  summary: () => get<OutpassCounts>('/outpasses/summary'),
  overdue: () => get<(Outpass & { hours_overdue: number; full_name: string })[]>('/outpasses/overdue'),
  get: (id: number) => get<Outpass>(`/outpasses/${id}`),
  review: (id: number, decision: 'APPROVED' | 'REJECTED') => post<Outpass>(`/outpasses/${id}/review`, { decision }),
  recordReturn: (id: number, returned_at?: string) => post<Outpass>(`/outpasses/${id}/return`, { returned_at }),
  cancel: (id: number) => post<Outpass>(`/outpasses/${id}/cancel`),
};

export const documentApi = {
  types: () => get<string[]>('/documents/types'),
  list: (p: Params) => get<Page<DocumentRow>>('/documents', p),
  summary: () => get<{ pending: number; verified: number; rejected: number; total: number }>('/documents/summary'),
  upload: (file: File, docType: string, onProgress?: (pct: number) => void) => {
    const fd = new FormData();
    fd.append('doc_type', docType);
    fd.append('file', file);
    return http.post<DocumentRow>('/documents', fd, {
      onUploadProgress: (e) => e.total && onProgress?.(Math.round((e.loaded / e.total) * 100)),
    }).then((r) => r.data);
  },
  fileUrl: (id: number, download = false) => `/api/documents/${id}/file${download ? '?download=1' : ''}`,
  setStatus: (id: number, status: VerifyStatus) => patch<DocumentRow>(`/documents/${id}/status`, { status }),
  remove: (id: number) => del(`/documents/${id}`),
};

export const calendarApi = {
  list: (p: Params) => get<CalendarEntry[]>('/calendar', p),
  create: (body: CalendarEntry) => post<CalendarEntry>('/calendar', body),
  update: (key: { title: string; start: string }, body: CalendarEntry) => put<CalendarEntry>('/calendar/entry', body, key),
  remove: (key: { title: string; start: string }) => del('/calendar/entry', key),
};

export const adminApi = {
  dashboard: () => get<AdminDashboard>('/admin/dashboard'),
};

export const reportApi = {
  list: () => get<ReportMeta[]>('/reports'),
  run: (key: string, params: Params) => get<ReportResult>(`/reports/${enc(key)}`, params),
};

export const integrityApi = {
  tests: () => get<IntegrityTest[]>('/integrity/tests'),
  run: (key: string) => post<IntegrityResult>(`/integrity/tests/${enc(key)}/run`),
  runAll: () => post<{ results: IntegrityResult[]; passed: number; total: number }>('/integrity/tests/run-all'),
  audits: () => get<{ audits: AuditResult[]; allPassed: boolean }>('/integrity/audits'),
  catalog: () => get<DbCatalog>('/integrity/catalog'),
};
