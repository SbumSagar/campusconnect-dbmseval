export type Role = 'student' | 'admin';

export interface SessionUser {
  sub: string;
  role: Role;
  name: string;
  email: string;
  adminId?: number;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  pages: number;
}

export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export type OrderStatus = 'PLACED' | 'PREPARING' | 'READY' | 'COMPLETED' | 'CANCELLED';
export type OutpassStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
export type VerifyStatus = 'PENDING' | 'VERIFIED' | 'REJECTED';
export type EventType = 'HOLIDAY' | 'EVENT' | 'EXAM';
export type AllocationStatus = 'ACTIVE' | 'ENDED';

export interface Student {
  student_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  gender: Gender | null;
  program: string | null;
  total_deductions_amount: number;
  hostel_name?: string | null;
  room_no?: string | null;
  allocated_since?: string | null;
  floor_no?: number | null;
  hostel_type?: string | null;
  warden_name?: string | null;
}

export interface Hostel {
  hostel_name: string;
  hostel_type: string;
  gender: 'MALE' | 'FEMALE' | 'COED';
  warden_name: string | null;
  total_rooms: number;
  occupied_rooms: number;
  empty_rooms: number;
  residents: number;
  max_room_occupancy: number;
  avg_per_room: number;
  floors?: { floor_no: number; rooms: number; residents: number; empty_rooms: number }[];
}

export interface Resident {
  student_id: string;
  full_name: string;
  start_date: string;
}

export interface Room {
  hostel_name: string;
  room_no: string;
  floor_no: number;
  occupancy: number;
  residents?: Resident[];
  gender?: string;
}

export interface Allocation {
  student_id: string;
  hostel_name: string;
  room_no: string;
  start_date: string;
  end_date: string | null;
  status: AllocationStatus;
  floor_no?: number;
  hostel_type?: string;
  warden_name?: string | null;
  days?: number;
  full_name?: string;
  gender?: string;
  event_date?: string;
}

export interface Store {
  store_name: string;
  store_type: string | null;
  location: string | null;
  opens_at: string | null;
  closes_at: string | null;
  /** computed by PostgreSQL (fn_store_is_open, campus time) */
  is_open_now?: boolean;
  item_count?: number;
  available_count?: number;
  min_price?: number | null;
  categories?: string[];
}

export interface MenuItem {
  store_name: string;
  item_name: string;
  category: string | null;
  price: number;
  is_available: boolean;
  sold?: number;
}

export interface OrderSummary {
  order_id: number;
  student_id: string;
  student_name?: string;
  store_name: string;
  ordered_at: string;
  status: OrderStatus;
  total_amount: number;
  item_count?: number;
  summary?: string;
}

export interface OrderLine {
  item_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  category: string | null;
  current_price: number;
}

export interface OrderDetail extends OrderSummary {
  store_location: string | null;
  store_type: string | null;
  items: OrderLine[];
}

export interface Outpass {
  request_id: number;
  student_id: string;
  student_name: string;
  reviewed_by: number | null;
  reviewer_name: string | null;
  reviewer_role: string | null;
  reason: string;
  out_at: string;
  return_by: string;
  returned_at: string | null;
  status: OutpassStatus;
  reviewed_at: string | null;
  is_overdue: boolean;
  returned_late: boolean;
}

export interface OutpassCounts {
  pending: number;
  approved: number;
  rejected: number;
  cancelled: number;
  overdue: number;
  out_now: number;
  total: number;
}

export interface DocumentRow {
  document_id: number;
  student_id: string;
  student_name?: string;
  doc_type: string;
  file_path: string;
  file_name: string;
  uploaded_at: string;
  verify_status: VerifyStatus;
}

export interface CalendarEntry {
  title: string;
  event_type: EventType;
  description: string | null;
  start_datetime: string;
  end_datetime: string | null;
}

export interface Admin {
  email: string;
  full_name: string;
  role: string;
}

/** Error body returned by the API (PostgreSQL details included when the DB rejected the operation). */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: {
    sqlstate?: string;
    constraint?: string | null;
    table?: string | null;
    detail?: string | null;
    hint?: string | null;
    dbMessage?: string;
  } | { path: string; message: string }[];
}

export interface StudentDashboard {
  profile: Student;
  stats: {
    orders_total: number;
    orders_active: number;
    orders_open: number;
    outpass_pending: number;
    outpass_open: number;
    docs_pending: number;
    docs_verified: number;
    docs_rejected: number;
    spend_this_month: number;
  };
  upcoming: CalendarEntry[];
  recentOrders: OrderSummary[];
  activeOutpasses: Outpass[];
}

export interface AdminDashboard {
  totals: Record<string, number>;
  hostels: Pick<Hostel, 'hostel_name' | 'gender' | 'total_rooms' | 'occupied_rooms' | 'empty_rooms' | 'residents' | 'avg_per_room'>[];
  ordersDaily: { day: string; orders: number; revenue: number }[];
  stores: { store_name: string; revenue: number; orders: number }[];
  outpassStatus: { status: OutpassStatus; count: number }[];
  upcoming: CalendarEntry[];
  recentOrders: OrderSummary[];
  pendingOutpasses: Pick<Outpass, 'request_id' | 'student_id' | 'student_name' | 'reason' | 'out_at' | 'return_by'>[];
}

export interface ReportParam {
  name: string;
  label: string;
  type: 'date' | 'number' | 'text' | 'store';
  placeholder?: string;
}

export interface ReportMeta {
  key: string;
  title: string;
  description: string;
  group: string;
  concepts: string[];
  params: ReportParam[];
  chart?: { type: 'bar' | 'line' | 'pie'; x: string; y: string[] };
  sql: string;
}

export interface ReportResult {
  meta: ReportMeta;
  sql: string;
  params: Record<string, unknown>;
  columns: string[];
  rows: Record<string, unknown>[];
  rowCount: number;
  durationMs: number;
}

export interface IntegrityTest {
  key: string;
  title: string;
  category: 'Constraint' | 'Trigger' | 'Application rule' | 'Behaviour';
  rule: string;
  enforcedBy: string;
  expected: string;
}

export interface IntegrityResult extends IntegrityTest {
  operation: string;
  actual: {
    outcome: 'REJECTED' | 'ACCEPTED';
    sqlstate: string | null;
    constraint: string | null;
    message: string;
    detail?: string | null;
  };
  passed: boolean;
  notes: string[];
  durationMs: number;
  rolledBack: boolean;
}

export interface AuditResult {
  name: string;
  description: string;
  sql: string;
  rowCount: number;
  sample: Record<string, unknown>[];
}

export interface DbCatalog {
  tables: { table_name: string; rows: number }[];
  triggers: { name: string; table_name: string; function_name: string; definition: string; deferrable: boolean }[];
  indexes: { name: string; table_name: string; definition: string }[];
  constraints: { name: string; table_name: string; type: string; definition: string }[];
  views: { name: string; definition: string }[];
  functions: { name: string; args: string; returns: string }[];
}
