import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { z } from 'zod';

/** Project root (backend/src/config → ../../..). Works from src/ and dist/. */
export const ROOT_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true } as dotenv.DotenvConfigOptions);

const schema = z.object({
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  CLIENT_ORIGIN: z.string().default('http://localhost:5173'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters')
    .refine((s) => !s.startsWith('replace-this'), 'JWT_SECRET still has the placeholder value from .env.example'),
  SESSION_TTL: z.string().default('8h'),
  DEMO_STUDENT_PASSWORD: z.string().optional(),
  DEMO_ADMIN_PASSWORD: z.string().optional(),
  DEMO_STUDENT_PASSWORD_HASH: z.string().optional(),
  DEMO_ADMIN_PASSWORD_HASH: z.string().optional(),
  DEMO_STUDENT_PREFIXES: z.string().default('DEMO'),
  UPLOAD_DIR: z.string().default('uploads'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(50).default(5),
}).refine((e) => e.DEMO_STUDENT_PASSWORD || e.DEMO_STUDENT_PASSWORD_HASH, {
  message: 'Set DEMO_STUDENT_PASSWORD or DEMO_STUDENT_PASSWORD_HASH', path: ['DEMO_STUDENT_PASSWORD'],
}).refine((e) => e.DEMO_ADMIN_PASSWORD || e.DEMO_ADMIN_PASSWORD_HASH, {
  message: 'Set DEMO_ADMIN_PASSWORD or DEMO_ADMIN_PASSWORD_HASH', path: ['DEMO_ADMIN_PASSWORD'],
});

export type Env = z.infer<typeof schema>;

function load(): Env {
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Fail safely: refuse to start with a missing or weak configuration.
    console.error('\n✖ Invalid server configuration (.env):');
    for (const issue of parsed.error.issues) console.error(`  - ${issue.path.join('.') || 'env'}: ${issue.message}`);
    console.error('  Copy .env.example to .env in the project root and fill in the values.\n');
    process.exit(1);
  }
  return parsed.data;
}

export const env = load();
export const UPLOAD_ROOT = path.resolve(ROOT_DIR, env.UPLOAD_DIR);
export const DB_SQL_DIR = path.join(ROOT_DIR, 'db');
export const demoPrefixes = env.DEMO_STUDENT_PREFIXES.split(',').map((p) => p.trim().toUpperCase()).filter(Boolean);
