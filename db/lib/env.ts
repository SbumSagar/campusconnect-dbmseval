import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

/** Absolute path of the `db/` folder. */
export const DB_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Absolute path of the project root (one level above `db/`). */
export const ROOT_DIR = path.resolve(DB_DIR, '..');

dotenv.config({ path: path.join(ROOT_DIR, '.env'), quiet: true } as dotenv.DotenvConfigOptions);

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value || !value.trim()) {
    console.error(`\n✖ Missing environment variable ${name}.`);
    console.error(`  Copy .env.example to .env in the project root and set ${name}.\n`);
    process.exit(1);
  }
  return value.trim();
}

/** Mask the password of a connection string for logging. */
export function maskUrl(url: string): string {
  try {
    const u = new URL(url);
    if (u.password) u.password = '****';
    return u.toString();
  } catch {
    return '<invalid url>';
  }
}

export function databaseUrl(): string {
  return requireEnv('DATABASE_URL');
}
