/** Error with an HTTP status, thrown by services / middleware. */
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = 'ERROR',
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, msg, 'BAD_REQUEST', details);
export const unauthorized = (msg = 'Please sign in') => new HttpError(401, msg, 'UNAUTHORIZED');
export const forbidden = (msg = 'You are not allowed to do this') => new HttpError(403, msg, 'FORBIDDEN');
export const notFound = (what = 'Resource') => new HttpError(404, `${what} not found`, 'NOT_FOUND');
export const conflict = (msg: string) => new HttpError(409, msg, 'CONFLICT');
/** Business rule enforced by the application (not by a DB constraint). */
export const ruleViolation = (msg: string) => new HttpError(422, msg, 'APP_RULE');

export interface PgError extends Error {
  code?: string;
  constraint?: string;
  table?: string;
  column?: string;
  detail?: string;
  hint?: string;
  where?: string;
}

/** Human-friendly explanations of the schema's named constraints. */
const CONSTRAINT_MESSAGES: Record<string, string> = {
  uq_one_active_allocation: 'This student already has an ACTIVE room allocation (one active room per student).',
  room_allocation_pkey: 'This student already has a stay in this room starting on the same date - the key (student, hostel, room, start_date) would repeat. Choose another room or a later effective date.',
  chk_alloc_dates: 'An allocation cannot end before it starts.',
  chk_alloc_status: 'An allocation is ACTIVE exactly when it has no end date.',
  student_email_key: 'Another student already uses this e-mail address.',
  student_pkey: 'A student with this ID already exists.',
  admin_email_key: 'Another admin already uses this e-mail address.',
  room_pkey: 'This room number already exists in the hostel.',
  hostel_pkey: 'A hostel with this name already exists.',
  campus_store_pkey: 'A store with this name already exists.',
  menu_item_pkey: 'This store already has an item with that name.',
  calendar_pkey: 'An entry with the same title and start time already exists.',
  order_item_pkey: 'The same item appears twice in this order.',
  order_item_order_id_store_name_fkey: 'An order can only contain items from the store that received it.',
  order_item_store_name_item_name_fkey: 'This item is not on the store\'s menu.',
  chk_outpass_window: 'The expected return time must be after the departure time.',
  chk_outpass_returned: 'The return time cannot be before the departure time.',
  chk_outpass_reviewed: 'reviewed_by and reviewed_at must be set together.',
  chk_calendar_dates: 'The end of an entry cannot be before its start.',
  menu_item_price_check: 'Price cannot be negative.',
  order_item_quantity_check: 'Quantity must be greater than zero.',
  room_floor_no_check: 'Floor number cannot be negative.',
};

/** Translates a PostgreSQL error (by SQLSTATE) into an HttpError, keeping the DB details. */
export function translatePgError(err: PgError): HttpError | null {
  if (!err.code || !/^[0-9A-Z]{5}$/.test(err.code)) return null;
  const details = {
    sqlstate: err.code,
    constraint: err.constraint ?? null,
    table: err.table ?? null,
    detail: err.detail ?? null,
    hint: err.hint ?? null,
    dbMessage: err.message,
  };
  const known = err.constraint ? CONSTRAINT_MESSAGES[err.constraint] : undefined;
  switch (err.code) {
    case '23505':
      return new HttpError(409, known ?? 'A record with the same key already exists.', 'UNIQUE_VIOLATION', details);
    case '23503':
      if (/still referenced|is still referenced/.test(err.detail ?? '') || /update or delete/.test(err.message)) {
        return new HttpError(409, `Cannot delete or change this record: it is still referenced by ${err.table ?? 'other records'} (history is kept).`, 'FK_VIOLATION', details);
      }
      return new HttpError(409, known ?? 'A referenced record does not exist.', 'FK_VIOLATION', details);
    case '23514':
      return new HttpError(422, known ?? `Value rejected by check constraint ${err.constraint ?? ''}.`.trim(), 'CHECK_VIOLATION', details);
    case '23502':
      return new HttpError(422, `${err.column ?? 'A required field'} must not be empty.`, 'NOT_NULL_VIOLATION', details);
    case 'P0001':
      return new HttpError(422, err.message, 'TRIGGER_EXCEPTION', details);
    case '22P02':
    case '22007':
    case '22008':
    case '22003':
    case '22001':
      return new HttpError(400, `Invalid value: ${err.message}`, 'INVALID_INPUT', details);
    case '40001':
    case '40P01':
      return new HttpError(409, 'The database was busy with a conflicting change - please retry.', 'SERIALIZATION', details);
    default:
      return null;
  }
}
