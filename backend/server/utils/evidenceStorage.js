import path from 'node:path';
import fs from 'node:fs';
import { randomUUID } from 'node:crypto';
import { HttpError } from './http.js';

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);

const mode = process.env.UPLOAD_STORAGE || 'local';
const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'server/public/uploads');
if ((mode === 'local' || mode === 'persistent-volume') && !fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

export function detectImageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return '.jpg';
  if (buffer.length >= 8 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47 && buffer[4] === 0x0d && buffer[5] === 0x0a && buffer[6] === 0x1a && buffer[7] === 0x0a) return '.png';
  if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return '.webp';
  return null;
}

export function validateEvidenceFile(file) {
  const originalExtension = path.extname(file.originalname).toLowerCase();
  const detectedExtension = detectImageExtension(file.buffer);
  const valid = ALLOWED_IMAGE_EXTENSIONS.has(originalExtension)
    && ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)
    && detectedExtension
    && (originalExtension === detectedExtension || (originalExtension === '.jpeg' && detectedExtension === '.jpg'));
  if (!valid) throw new HttpError(400, 'INVALID_EVIDENCE_FILE', 'Evidence photo must be a valid JPG, PNG, or WEBP image.');
  return detectedExtension;
}

export async function saveEvidenceFile(file) {
  if (!file) return null;
  if (mode === 'object-storage') {
    throw new HttpError(501, 'OBJECT_STORAGE_NOT_CONFIGURED', 'Object storage adapter requires bucket credentials before accepting evidence uploads.');
  }
  const extension = validateEvidenceFile(file);
  const filename = `qc-${randomUUID()}${extension}`;
  await fs.promises.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx' });
  return filename;
}

export function resolveEvidenceFilePath(filename) {
  const safeName = path.basename(String(filename || ''));
  const extension = path.extname(safeName).toLowerCase();
  if (!safeName || safeName !== filename || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new HttpError(400, 'INVALID_EVIDENCE_FILE', 'Evidence filename is invalid.');
  }
  return path.join(uploadDir, safeName);
}
