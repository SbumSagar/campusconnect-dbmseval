import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

// Point the app at the TEST database before src/config/env.ts is imported.
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
dotenv.config({ path: path.join(root, '.env'), quiet: true } as dotenv.DotenvConfigOptions);
if (!process.env.TEST_DATABASE_URL) throw new Error('TEST_DATABASE_URL must be set in .env');
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.NODE_ENV = 'test';
process.env.UPLOAD_DIR = 'backend/test-uploads';
process.env.JWT_SECRET ??= 'test-secret-test-secret-test-secret-123456';
process.env.DEMO_STUDENT_PASSWORD = 'student-test-pw';
process.env.DEMO_ADMIN_PASSWORD = 'admin-test-pw';
delete process.env.DEMO_STUDENT_PASSWORD_HASH;
delete process.env.DEMO_ADMIN_PASSWORD_HASH;
