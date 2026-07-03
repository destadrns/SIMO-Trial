import { randomUUID } from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { Router } from 'express';
import multer from 'multer';
import { all, get, run, withTransaction } from '../db/database.js';
import { requireAuth, requireRoles } from '../utils/auth.js';
import { resolveActor, writeAuditLog } from '../utils/auditLogger.js';
import {
  asyncHandler,
  HttpError,
  requireNonEmptyString,
  requireNonNegativeNumber,
  requireRecord,
  sendData,
} from '../utils/http.js';
import { serializeQcChecklist } from '../utils/serializers.js';

const QC_STATUS_OPTIONS = ['Pending', 'Passed QC', 'Rework'];
const QC_SUBMISSION_ROLES = ['QC Inspector', 'Admin'];
const QC_READ_ROLES = ['Admin', 'Owner', 'Production Manager', 'QC Inspector'];

const uploadDir = path.resolve(process.cwd(), process.env.UPLOAD_DIR || 'server/public/uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const ALLOWED_IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);
const ALLOWED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_EVIDENCE_FILE_SIZE },
});

function detectImageExtension(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return '.jpg';
  }

  if (
    buffer.length >= 8
    && buffer[0] === 0x89
    && buffer[1] === 0x50
    && buffer[2] === 0x4e
    && buffer[3] === 0x47
    && buffer[4] === 0x0d
    && buffer[5] === 0x0a
    && buffer[6] === 0x1a
    && buffer[7] === 0x0a
  ) {
    return '.png';
  }

  if (
    buffer.length >= 12
    && buffer.toString('ascii', 0, 4) === 'RIFF'
    && buffer.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return '.webp';
  }

  return null;
}


function resolveEvidenceFilePath(filename) {
  const safeName = path.basename(String(filename || ''));
  const extension = path.extname(safeName).toLowerCase();

  if (!safeName || safeName !== filename || !ALLOWED_IMAGE_EXTENSIONS.has(extension)) {
    throw new HttpError(400, 'INVALID_EVIDENCE_FILE', 'Evidence filename is invalid.');
  }

  return path.join(uploadDir, safeName);
}

async function persistEvidenceFile(file) {
  if (!file) {
    return null;
  }

  const originalExtension = path.extname(file.originalname).toLowerCase();
  const detectedExtension = detectImageExtension(file.buffer);

  if (
    !ALLOWED_IMAGE_EXTENSIONS.has(originalExtension)
    || !ALLOWED_IMAGE_MIME_TYPES.has(file.mimetype)
    || !detectedExtension
    || (originalExtension !== detectedExtension && !(originalExtension === '.jpeg' && detectedExtension === '.jpg'))
  ) {
    throw new HttpError(400, 'INVALID_EVIDENCE_FILE', 'Evidence photo must be a valid JPG, PNG, or WEBP image.');
  }

  const filename = `qc-${randomUUID()}${detectedExtension}`;
  await fs.promises.writeFile(path.join(uploadDir, filename), file.buffer, { flag: 'wx' });
  return filename;
}

function requireQcSubmissionRole(req, res, next) {
  void res;

  if (!QC_SUBMISSION_ROLES.includes(req.user?.roleName)) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'Akses submit QC hanya tersedia untuk QC Inspector dan Admin.',
    );
  }

  next();
}

function handleEvidenceUpload(req, res, next) {
  upload.single('evidencePhoto')(req, res, async (error) => {
    if (error instanceof multer.MulterError) {
      const message = error.code === 'LIMIT_FILE_SIZE'
        ? 'Evidence photo must be 5 MB or smaller.'
        : 'Evidence photo could not be uploaded.';
      next(new HttpError(400, 'INVALID_EVIDENCE_FILE', message));
      return;
    }

    if (error) {
      next(new HttpError(400, 'INVALID_EVIDENCE_FILE', error.message || 'Invalid evidence file.'));
      return;
    }

    try {
      req.evidenceFilename = await persistEvidenceFile(req.file);
      next();
    } catch (persistError) {
      next(persistError);
    }
  });
}

export function createQcChecklistsRouter(db) {
  const router = Router();

  router.get('/', requireAuth, requireRoles(...QC_READ_ROLES), asyncHandler(async (req, res) => {
    const rows = await all(db, 'SELECT * FROM qc_checklists ORDER BY created_at DESC, id DESC');
    sendData(res, rows.map(serializeQcChecklist), { meta: { count: rows.length } });
  }));


  router.get('/evidence/:filename', requireAuth, requireRoles(...QC_READ_ROLES), asyncHandler(async (req, res) => {
    const filePath = resolveEvidenceFilePath(req.params.filename);

    if (!fs.existsSync(filePath)) {
      throw new HttpError(404, 'NOT_FOUND', 'Evidence file not found.');
    }

    res.sendFile(filePath);
  }));

  router.get('/:id', requireAuth, requireRoles(...QC_READ_ROLES), asyncHandler(async (req, res) => {
    const row = requireRecord(
      await get(db, 'SELECT * FROM qc_checklists WHERE id = ?', [req.params.id]),
      'QC checklist',
    );
    sendData(res, serializeQcChecklist(row));
  }));

  router.post('/', requireAuth, requireQcSubmissionRole, handleEvidenceUpload, asyncHandler(async (req, res) => {
    const payload = req.body || {};
    const workItemId = requireNonEmptyString(payload.workItemId, 'workItemId');
    const materialName = requireNonEmptyString(payload.materialName, 'materialName');
    const notes = requireNonEmptyString(payload.notes, 'notes');
    const length = requireNonNegativeNumber(payload.length, 'length');
    const width = requireNonNegativeNumber(payload.width, 'width');
    const thickness = requireNonNegativeNumber(payload.thickness, 'thickness');

    if (!QC_STATUS_OPTIONS.includes(payload.qcStatus)) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `qcStatus must be one of: ${QC_STATUS_OPTIONS.join(', ')}.`,
        { field: 'qcStatus', allowedValues: QC_STATUS_OPTIONS },
      );
    }

    const workItem = requireRecord(
      await get(db, 'SELECT * FROM work_items WHERE id = ?', [workItemId]),
      'Work item',
    );
    const actor = await resolveActor(db, req.user.id);
    const checklistId = `qc-${randomUUID()}`;
    const evidenceReference = req.evidenceFilename
      || String(payload.evidencePhotoReference ?? payload.evidencePhoto ?? '').trim();

    const checklist = await withTransaction(db, async () => {
      await run(
        db,
        `INSERT INTO qc_checklists
          (id, project_id, warehouse_id, work_item_id, material_name, length, width,
           thickness, qc_status, notes, evidence_photo_reference, inspector_user_id,
           inspector_name, inspector_role, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
        [
          checklistId,
          workItem.project_id,
          workItem.warehouse_id,
          workItem.id,
          materialName,
          length,
          width,
          thickness,
          payload.qcStatus,
          notes,
          evidenceReference,
          actor.id,
          actor.name,
          actor.roleName,
        ],
      );

      await run(
        db,
        `UPDATE work_items
         SET qc_status = ?, ready_to_ship = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [payload.qcStatus, payload.qcStatus === 'Passed QC' ? 1 : 0, workItem.id],
      );

      await writeAuditLog(db, {
        actor,
        module: 'QualityControl',
        actionType: 'SUBMIT_QC_CHECKLIST',
        action: 'INSERT',
        entityType: 'qc_checklists',
        entityId: checklistId,
        tableName: 'qc_checklists',
        previousValue: workItem.qc_status,
        newValue: payload.qcStatus,
        description: `Submitted QC checklist for ${materialName}.`,
      });

      return get(db, 'SELECT * FROM qc_checklists WHERE id = ?', [checklistId]);
    });

    sendData(res, serializeQcChecklist(checklist), { status: 201 });
  }));

  return router;
}
