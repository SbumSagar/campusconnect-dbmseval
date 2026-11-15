import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { UPLOAD_ROOT, env } from '../config/env.js';
import { badRequest } from '../utils/errors.js';

const ALLOWED: Record<string, string[]> = {
  '.pdf': ['application/pdf'],
  '.png': ['image/png'],
  '.jpg': ['image/jpeg'],
  '.jpeg': ['image/jpeg'],
  '.webp': ['image/webp'],
};

/** Magic numbers - the extension and the browser's MIME type can both be forged. */
const SIGNATURES: [string, (b: Buffer) => boolean][] = [
  ['.pdf', (b) => b.subarray(0, 5).toString('latin1') === '%PDF-'],
  ['.png', (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))],
  ['.jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['.jpeg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff],
  ['.webp', (b) => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP'],
];

const safeBase = (name: string) =>
  path.basename(name, path.extname(name)).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60) || 'document';

const storage = multer.diskStorage({
  destination(req, _file, cb) {
    const dir = path.join(UPLOAD_ROOT, req.user!.sub);
    fs.mkdir(dir, { recursive: true }, (err) => cb(err, dir));
  },
  filename(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${Date.now()}_${crypto.randomBytes(4).toString('hex')}__${safeBase(file.originalname)}${ext}`);
  },
});

export const uploadDocument = multer({
  storage,
  limits: { fileSize: env.MAX_UPLOAD_MB * 1024 * 1024, files: 1, fields: 5 },
  fileFilter(_req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED[ext] || !ALLOWED[ext].includes(file.mimetype)) {
      return cb(badRequest('Only PDF, PNG, JPG or WEBP files are accepted'));
    }
    cb(null, true);
  },
}).single('file');

/** After multer: verify the file's real content type; delete it if it does not match. */
export function verifyUploadSignature(req: Request, _res: Response, next: NextFunction) {
  const f = req.file;
  if (!f) return next(badRequest('Choose a file to upload'));
  const ext = path.extname(f.filename).toLowerCase();
  const fd = fs.openSync(f.path, 'r');
  const head = Buffer.alloc(16);
  fs.readSync(fd, head, 0, 16, 0);
  fs.closeSync(fd);
  const check = SIGNATURES.find(([e]) => e === ext);
  if (!check || !check[1](head)) {
    fs.rm(f.path, { force: true }, () => undefined);
    return next(badRequest('The file content does not match its type'));
  }
  next();
}
