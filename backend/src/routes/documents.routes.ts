import fs from 'node:fs';
import { Router } from 'express';
import { z } from 'zod';
import { requireAdmin, requireAny, requireStudent, studentId } from '../middleware/auth.js';
import { uploadDocument, verifyUploadSignature } from '../middleware/upload.js';
import * as docs from '../services/documents.service.js';
import { badRequest, notFound } from '../utils/errors.js';
import { paginationSchema, zId, zSearch } from '../utils/validate.js';

const router = Router();

router.get('/types', requireAny, (_req, res) => {
  res.json(docs.DOC_TYPES);
});

/** Student upload: file goes to disk, only metadata + relative path go to DOCUMENT. */
router.post('/', requireStudent, uploadDocument, verifyUploadSignature, async (req, res) => {
  const docType = z.string().trim().min(1).max(50).safeParse(req.body?.doc_type);
  if (!docType.success || !docs.DOC_TYPES.includes(docType.data)) {
    fs.rm(req.file!.path, { force: true }, () => undefined);
    throw badRequest('Choose a valid document type');
  }
  const rel = `${studentId(req)}/${req.file!.filename}`;
  res.status(201).json(await docs.createDocument(studentId(req), docType.data, rel));
});

const listSchema = paginationSchema.extend({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']).optional(),
  type: z.string().max(50).optional(),
  q: zSearch(),
});

router.get('/', requireAny, async (req, res) => {
  const f = listSchema.parse(req.query);
  const student = req.user!.role === 'student' ? req.user!.sub : undefined;
  res.json(await docs.listDocuments({ ...f, student, q: student ? undefined : f.q }));
});

router.get('/summary', requireAny, async (req, res) => {
  res.json(await docs.documentCounts(req.user!.role === 'student' ? req.user!.sub : undefined));
});

router.get('/:id', requireAny, async (req, res) => {
  res.json(await docs.getDocument(zId.parse(req.params.id), req.user!));
});

/** Download / preview: only the owning student or an admin. */
router.get('/:id/file', requireAny, async (req, res) => {
  const doc = await docs.getDocument(zId.parse(req.params.id), req.user!);
  const abs = docs.resolveFile(doc.file_path);
  if (!fs.existsSync(abs)) throw notFound('Stored file');
  const disposition = req.query.download === '1' ? 'attachment' : 'inline';
  res.setHeader('Content-Disposition', `${disposition}; filename="${doc.file_name.replace(/"/g, '')}"`);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-store');
  res.sendFile(abs);
});

router.patch('/:id/status', requireAdmin, async (req, res) => {
  const { status } = z.object({ status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']) }).parse(req.body);
  res.json(await docs.setVerifyStatus(zId.parse(req.params.id), status));
});

router.delete('/:id', requireStudent, async (req, res) => {
  await docs.deleteOwnDocument(zId.parse(req.params.id), req.user!);
  res.status(204).end();
});

export default router;
