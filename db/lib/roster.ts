import ExcelJS from 'exceljs';
import type pg from 'pg';

export interface RosterStudent {
  /** 1-based spreadsheet row number. */
  row: number;
  /** First column of the spreadsheet - not part of the approved STUDENT schema. */
  excelId: string;
  studentId: string;
  fullName: string;
  gender: 'MALE' | 'FEMALE';
  email: string;
}

export interface SkippedRow {
  row: number;
  reason: string;
  values: string[];
}

export interface ParsedRoster {
  sheet: string;
  totalRows: number;
  valid: RosterStudent[];
  skipped: SkippedRow[];
}

const cellText = (v: ExcelJS.CellValue): string => {
  if (v === null || v === undefined) return '';
  if (typeof v === 'object') {
    if ('text' in v && typeof v.text === 'string') return v.text.trim();
    if ('result' in v && v.result !== undefined) return String(v.result).trim();
    if ('richText' in v) return v.richText.map((t) => t.text).join('').trim();
  }
  return String(v).trim();
};

/** Demo e-mail on the reserved `.invalid` TLD (RFC 2606) - never deliverable. */
export const demoEmail = (studentId: string) => `${studentId.toLowerCase()}@students.campusconnect.invalid`;

const SEX: Record<string, 'MALE' | 'FEMALE'> = { M: 'MALE', MALE: 'MALE', F: 'FEMALE', FEMALE: 'FEMALE' };

/**
 * Reads the on-campus list (columns: ID, Campus ID, Name, Sex).
 * Skips empty rows, header rows (including the repeated header at the end),
 * incomplete / invalid rows and duplicate Campus IDs - each with a reason.
 * Campus IDs are validated only loosely (alphanumeric, ≤ 20 chars) so that
 * valid IDs with uncommon suffixes are not excluded.
 */
export async function parseRoster(file: string): Promise<ParsedRoster> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(file);
  const ws = wb.worksheets[0];
  const valid: RosterStudent[] = [];
  const skipped: SkippedRow[] = [];
  const seen = new Map<string, number>();
  let totalRows = 0;

  for (let r = 1; r <= ws.rowCount; r++) {
    totalRows++;
    const row = ws.getRow(r);
    const values = [1, 2, 3, 4].map((c) => cellText(row.getCell(c).value));
    const [excelId, rawId, rawName, rawSex] = values;

    if (values.every((v) => v === '')) { skipped.push({ row: r, reason: 'empty row', values }); continue; }
    if (rawId.toLowerCase() === 'campus id' || rawSex.toLowerCase() === 'sex') {
      skipped.push({ row: r, reason: 'header row', values }); continue;
    }
    const studentId = rawId.toUpperCase().replace(/\s+/g, '');
    const fullName = rawName.replace(/\s+/g, ' ').trim();
    const gender = SEX[rawSex.toUpperCase()];

    if (!studentId || !fullName || !rawSex) { skipped.push({ row: r, reason: 'incomplete record', values }); continue; }
    if (!/^[A-Z0-9]{1,20}$/.test(studentId)) { skipped.push({ row: r, reason: 'invalid Campus ID', values }); continue; }
    if (fullName.length > 150) { skipped.push({ row: r, reason: 'name longer than 150 characters', values }); continue; }
    if (!gender) { skipped.push({ row: r, reason: `unknown Sex value "${rawSex}"`, values }); continue; }
    if (seen.has(studentId)) {
      skipped.push({ row: r, reason: `duplicate Campus ID (first seen on row ${seen.get(studentId)})`, values }); continue;
    }
    seen.set(studentId, r);
    valid.push({ row: r, excelId, studentId, fullName, gender, email: demoEmail(studentId) });
  }
  return { sheet: ws.name, totalRows, valid, skipped };
}

/** Inserts roster students; existing student_ids / e-mails are left untouched. */
export async function insertRoster(client: pg.Client, students: RosterStudent[]): Promise<number> {
  let inserted = 0;
  for (let i = 0; i < students.length; i += 1000) {
    const chunk = students.slice(i, i + 1000);
    const res = await client.query(
      `INSERT INTO student (student_id, full_name, email, gender)
       SELECT * FROM unnest($1::varchar[], $2::varchar[], $3::varchar[], $4::varchar[])
       ON CONFLICT DO NOTHING`,
      [chunk.map((s) => s.studentId), chunk.map((s) => s.fullName), chunk.map((s) => s.email), chunk.map((s) => s.gender)],
    );
    inserted += res.rowCount ?? 0;
  }
  return inserted;
}

const csv = (v: string | number) => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** CSV preserving the spreadsheet ID ↔ student_id mapping and every skipped row. */
export function auditCsv(parsed: ParsedRoster): string {
  const lines = ['spreadsheet_row,excel_id,student_id,full_name,sex,result,reason'];
  for (const s of parsed.valid) {
    lines.push([s.row, s.excelId, s.studentId, s.fullName, s.gender, 'imported', ''].map(csv).join(','));
  }
  for (const s of parsed.skipped) {
    lines.push([s.row, s.values[0], s.values[1], s.values[2], s.values[3], 'skipped', s.reason].map(csv).join(','));
  }
  return lines.join('\n') + '\n';
}
