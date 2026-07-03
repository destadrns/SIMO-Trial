import { pathToFileURL } from 'node:url';
import { seedData } from './seedData.js';
import { closeDatabase, createDatabase, run, withTransaction } from '../db/database.js';
import { hashPassword } from '../utils/password.js';

const roleDescriptions = {
  owner: 'Business owner with operational visibility.',
  'production-manager': 'Manages production progress and delivery readiness.',
  foreman: 'Updates production work item execution.',
  'qc-inspector': 'Submits material quality inspections.',
  admin: 'Demo administrator with full operational access.',
};

const userEmails = {
  'usr-owner': 'rina.wijaya@simo.test',
  'usr-pm': 'budi.santoso@simo.test',
  'usr-foreman': 'joko.anwar@simo.test',
  'usr-qc': 'siti.nurhaliza@simo.test',
  'usr-admin': 'dewi.lestari@simo.test',
};

const projectLocations = {
  'prj-ikn-a': 'IKN Sector 4',
  'prj-ikn-b': 'IKN Residential District',
  'prj-sby-mall': 'Surabaya',
};

const logisticsManifests = [
  {
    id: 'lm-demo-001',
    manifestNumber: 'MJ-LOG-001',
    projectId: 'prj-ikn-a',
    driverName: 'Budi Hartono',
    driverPhone: '0812-9000-1001',
    vehiclePlate: 'B 9123 KJ',
    vehicleType: 'Colt Diesel Box',
    origin: 'Bekasi Production Warehouse',
    destination: 'IKN Project Site',
    deliveryStatus: 'On Delivery',
    departureTime: '2026-06-22T08:00:00.000Z',
    arrivalTime: null,
    notes: 'Facade panel batch for Tower A priority delivery.',
    createdBy: 'usr-admin',
  },
  {
    id: 'lm-demo-002',
    manifestNumber: 'MJ-LOG-002',
    projectId: 'prj-ikn-b',
    driverName: 'Agus Prasetyo',
    driverPhone: '0812-9000-1002',
    vehiclePlate: 'B 7745 TQ',
    vehicleType: 'Wingbox',
    origin: 'Bekasi Production Warehouse',
    destination: 'IKN Residential District',
    deliveryStatus: 'Prepared',
    departureTime: null,
    arrivalTime: null,
    notes: 'Awaiting QC release for final loading confirmation.',
    createdBy: 'usr-pm',
  },
  {
    id: 'lm-demo-003',
    manifestNumber: 'MJ-LOG-003',
    projectId: 'prj-sby-mall',
    driverName: 'Dedi Kurniawan',
    driverPhone: '0812-9000-1003',
    vehiclePlate: 'L 4510 MN',
    vehicleType: 'Fuso Bak',
    origin: 'Bekasi Production Warehouse',
    destination: 'Surabaya Mall Renovation Site',
    deliveryStatus: 'Arrived',
    departureTime: '2026-06-21T04:30:00.000Z',
    arrivalTime: '2026-06-22T02:15:00.000Z',
    notes: 'Received by site logistics coordinator.',
    createdBy: 'usr-admin',
  },
];

const deliveryCheckins = [
  {
    id: 'dci-demo-001',
    manifestId: 'lm-demo-001',
    status: 'On Delivery',
    locationText: 'Rest Area KM 57 Tol Jakarta-Cikampek',
    notes: 'Driver check-in manual, cargo seal intact.',
    checkedInBy: 'usr-admin',
    checkedInAt: '2026-06-22T10:15:00.000Z',
  },
  {
    id: 'dci-demo-002',
    manifestId: 'lm-demo-003',
    status: 'Arrived',
    locationText: 'Surabaya Mall Loading Dock B',
    notes: 'Material unloaded and received by site team.',
    checkedInBy: 'usr-pm',
    checkedInAt: '2026-06-22T02:15:00.000Z',
  },
];

function findUserByName(name) {
  return seedData.users.find((user) => user.name === name);
}

function inferAuditModule(log) {
  return log.table === 'qc_checklists' ? 'QualityControl' : 'Production';
}

function inferAuditActionType(log) {
  return log.table === 'qc_checklists' ? 'SUBMIT_QC_CHECKLIST' : 'UPDATE_WORK_STATUS';
}

export async function seedDatabase({ databasePath, db: providedDb } = {}) {
  const db = providedDb || await createDatabase(databasePath);

  try {
    await withTransaction(db, async () => {
      for (const role of seedData.roles) {
        await run(
          db,
          'INSERT OR IGNORE INTO roles (id, name, description) VALUES (?, ?, ?)',
          [role.id, role.name, roleDescriptions[role.id] || ''],
        );
      }

      for (const user of seedData.users) {
        const passwordHash = hashPassword('password', `demo-${user.id}`);
        await run(
          db,
          `INSERT OR IGNORE INTO users
            (id, name, email, password_hash, role_id, site, is_active, created_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)`,
          [user.id, user.name, userEmails[user.id], passwordHash, user.roleId, user.site],
        );
        await run(
          db,
          "UPDATE users SET password_hash = ? WHERE id = ? AND password_hash = ''",
          [passwordHash, user.id],
        );
      }

      for (const project of seedData.projects) {
        await run(
          db,
          `INSERT OR IGNORE INTO projects
            (id, code, name, client_name, location, status, due_date, priority, created_at)
           VALUES (?, ?, ?, ?, ?, 'Active', ?, ?, CURRENT_TIMESTAMP)`,
          [
            project.id,
            project.code,
            project.name,
            project.client,
            projectLocations[project.id] || '',
            project.dueDate,
            project.priority,
          ],
        );
      }

      for (const warehouse of seedData.warehouses) {
        await run(
          db,
          `INSERT OR IGNORE INTO warehouses
            (id, project_id, code, name, location, category, status, created_at)
           VALUES (?, NULL, ?, ?, ?, ?, 'Active', CURRENT_TIMESTAMP)`,
          [warehouse.id, warehouse.code, warehouse.name, warehouse.name, warehouse.category],
        );
      }

      for (const item of seedData.workItems) {
        await run(
          db,
          `INSERT OR IGNORE INTO work_items
            (id, project_id, warehouse_id, name, category, material_name, quantity, unit,
             status, progress_weight, qc_status, ready_to_ship, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, CURRENT_TIMESTAMP)`,
          [
            item.id,
            item.projectId,
            item.warehouseId,
            item.taskName,
            item.materialName,
            item.materialName,
            item.quantity,
            item.unit,
            item.status,
            item.qcStatus,
            item.readyToShip ? 1 : 0,
          ],
        );
      }

      for (const checklist of seedData.qcChecklists) {
        const inspector = findUserByName(checklist.createdBy);

        await run(
          db,
          `INSERT OR IGNORE INTO qc_checklists
            (id, project_id, warehouse_id, work_item_id, material_name, length, width,
             thickness, qc_status, notes, evidence_photo_reference, inspector_user_id,
             inspector_name, inspector_role, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            checklist.id,
            checklist.projectId,
            checklist.warehouseId,
            checklist.workItemId,
            checklist.materialName,
            checklist.length,
            checklist.width,
            checklist.thickness,
            checklist.qcStatus,
            checklist.notes,
            checklist.evidencePhoto,
            inspector?.id || null,
            checklist.createdBy,
            checklist.createdByRole,
            checklist.createdAt,
          ],
        );
      }

      for (const manifest of logisticsManifests) {
        await run(
          db,
          `INSERT OR IGNORE INTO logistics_manifests
            (id, manifest_number, project_id, driver_name, driver_phone, vehicle_plate,
             vehicle_type, origin, destination, delivery_status, departure_time, arrival_time,
             notes, created_by, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
          [
            manifest.id,
            manifest.manifestNumber,
            manifest.projectId,
            manifest.driverName,
            manifest.driverPhone,
            manifest.vehiclePlate,
            manifest.vehicleType,
            manifest.origin,
            manifest.destination,
            manifest.deliveryStatus,
            manifest.departureTime,
            manifest.arrivalTime,
            manifest.notes,
            manifest.createdBy,
          ],
        );
      }

      for (const checkin of deliveryCheckins) {
        await run(
          db,
          `INSERT OR IGNORE INTO delivery_checkins
            (id, manifest_id, status, location_text, notes, checked_in_by, checked_in_at)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [
            checkin.id,
            checkin.manifestId,
            checkin.status,
            checkin.locationText,
            checkin.notes,
            checkin.checkedInBy,
            checkin.checkedInAt,
          ],
        );
      }
      for (const log of seedData.auditLogs) {
        const user = findUserByName(log.user);

        await run(
          db,
          `INSERT OR IGNORE INTO audit_logs
            (id, user_id, user_name, role_name, module, action_type, action, entity_type,
             entity_id, table_name, previous_value, new_value, description, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            log.id,
            user?.id || null,
            log.user,
            log.role,
            inferAuditModule(log),
            inferAuditActionType(log),
            log.action,
            log.table,
            log.recordId,
            log.table,
            log.previousValue,
            log.newValue,
            log.description,
            log.timestamp,
          ],
        );
      }
    });

    return db;
  } finally {
    if (!providedDb) {
      await closeDatabase(db);
    }
  }
}

const isMainModule = process.argv[1]
  && import.meta.url === pathToFileURL(process.argv[1]).href;

if (isMainModule) {
  seedDatabase()
    .then(() => console.log('SIMO demo database seeded successfully.'))
    .catch((error) => {
      console.error('Failed to seed SIMO demo database.', error);
      process.exitCode = 1;
    });
}

