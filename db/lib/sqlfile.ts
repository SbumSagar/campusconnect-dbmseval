import fs from 'node:fs';

export interface NamedQuery {
  name: string;
  /** Comment lines that follow the @name marker (documentation). */
  comment: string;
  sql: string;
}

/**
 * Splits a .sql file into named queries.  A query starts with a line
 * `-- @name: <key>` and runs until the next marker.  Trailing semicolons
 * are removed so the text can be sent through node-postgres with params.
 */
export function parseNamedQueries(text: string): NamedQuery[] {
  const out: NamedQuery[] = [];
  const parts = text.split(/^--\s*@name:\s*/m).slice(1);
  for (const part of parts) {
    const nl = part.indexOf('\n');
    const name = part.slice(0, nl).trim();
    const body = part.slice(nl + 1);
    const lines = body.split(/\r?\n/);
    const commentLines: string[] = [];
    let i = 0;
    while (i < lines.length && /^\s*--/.test(lines[i])) {
      commentLines.push(lines[i].replace(/^\s*--\s?/, ''));
      i++;
    }
    const sql = lines.slice(i).join('\n').trim().replace(/;\s*$/, '');
    out.push({ name, comment: commentLines.join('\n').trim(), sql });
  }
  return out;
}

export function loadNamedQueries(file: string): Map<string, NamedQuery> {
  const list = parseNamedQueries(fs.readFileSync(file, 'utf8'));
  return new Map(list.map((q) => [q.name, q]));
}
