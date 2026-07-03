import { randomUUID } from 'node:crypto';
import { get, run } from '../db/database.js';
import { HttpError } from './http.js';

export async function resolveActor(db, userId) {
  if (!userId) {
    return {
      id: null,
      name: 'System',
      roleName: 'System',
    };
  }

  const user = await get(
    db,
    `SELECT u.id, u.name, r.name AS role_name
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.id = ? AND u.is_active = 1`,
    [userId],
  );

  if (!user) {
    throw new HttpError(400, 'INVALID_USER', 'userId must reference an active user.', {
      field: 'userId',
    });
  }

  return {
    id: user.id,
    name: user.name,
    roleName: user.role_name,
  };
}

export async function writeAuditLog(db, details) {
  const id = `log-${randomUUID()}`;

  await run(
    db,
    `INSERT INTO audit_logs
      (id, user_id, user_name, role_name, module, action_type, action, entity_type,
       entity_id, table_name, previous_value, new_value, description, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
    [
      id,
      details.actor.id,
      details.actor.name,
      details.actor.roleName,
      details.module,
      details.actionType,
      details.action,
      details.entityType,
      details.entityId,
      details.tableName,
      details.previousValue,
      details.newValue,
      details.description,
    ],
  );

  return id;
}
