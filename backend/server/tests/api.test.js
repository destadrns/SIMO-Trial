import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { closeDatabase, createDatabase, get, run } from '../db/database.js';
import { seedDatabase } from '../seed/seedDatabase.js';
import { hashPassword, verifyPassword } from '../utils/password.js';
import { resetRateLimitersForTests } from '../utils/rateLimiter.js';

process.env.JWT_SECRET ||= 'test-only-jwt-secret';
process.env.ENABLE_DEV_TOKEN_PREVIEW = 'true';

let db;
let server;
let baseUrl;
let currentToken = null;

async function request(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const headers = { ...options.headers };

  if (!isFormData && !headers['Content-Type']) {
    headers['Content-Type'] = 'application/json';
  }

  if (currentToken && !headers.Authorization) {
    headers.Authorization = `Bearer ${currentToken}`;
  }
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers,
  });
  const body = await response.json();
  return { response, body };
}

async function loginAs(email, password = 'password') {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });

  currentToken = loginRes.body.data.token;
  return loginRes;
}


test('password hashes verify only matching passwords', () => {
  const hash = hashPassword('password', 'test-salt');

  assert.equal(verifyPassword('password', hash), true);
  assert.equal(verifyPassword('wrong-password', hash), false);
  assert.equal(verifyPassword('password', 'password'), false);
});

before(async () => {
  db = await createDatabase(':memory:');
  await seedDatabase({ db });
  server = createApp({ db }).listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }

  if (db) {
    await closeDatabase(db);
  }
});

beforeEach(() => {
  currentToken = null;
  resetRateLimitersForTests();
});

test('health and collection endpoints return data envelopes', async () => {
  const paths = [
    '/api/health',
    '/api/roles',
    '/api/projects',
    '/api/warehouses',
    '/api/work-items',
  ];

  for (const path of paths) {
    const { response, body } = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok('data' in body, path);
  }

  await loginAs('rina.wijaya@simo.test');
  for (const path of ['/api/users', '/api/audit-logs', '/api/qc-checklists']) {
    const { response, body } = await request(path);
    assert.equal(response.status, 200, path);
    assert.ok('data' in body, path);
  }
});

test('detail and nested endpoints return expected records', async () => {
  const details = [
    ['/api/projects/prj-ikn-a', 'prj-ikn-a'],
    ['/api/warehouses/wh-frame', 'wh-frame'],
    ['/api/work-items/wi-001', 'wi-001'],
  ];

  for (const [path, expectedId] of details) {
    const { response, body } = await request(path);
    assert.equal(response.status, 200, path);
    assert.equal(body.data.id, expectedId);
  }

  await loginAs('rina.wijaya@simo.test');
  const userDetail = await request('/api/users/usr-owner');
  assert.equal(userDetail.response.status, 200);
  assert.equal(userDetail.body.data.id, 'usr-owner');
  const qcDetail = await request('/api/qc-checklists/qc-001');
  assert.equal(qcDetail.response.status, 200);
  assert.equal(qcDetail.body.data.id, 'qc-001');
  currentToken = null;

  const projectWarehouses = await request('/api/projects/prj-ikn-a/warehouses');
  assert.equal(projectWarehouses.response.status, 200);
  assert.ok(projectWarehouses.body.data.some((warehouse) => warehouse.id === 'wh-frame'));

  const warehouseItems = await request('/api/warehouses/wh-frame/work-items');
  assert.equal(warehouseItems.response.status, 200);
  assert.ok(warehouseItems.body.data.every((item) => item.warehouseId === 'wh-frame'));
});

test('audit logs support module and user filters', async () => {
  await loginAs('rina.wijaya@simo.test');
  const { response, body } = await request('/api/audit-logs?module=Production&userId=usr-pm');
  assert.equal(response.status, 200);
  assert.ok(body.data.length > 0);
  assert.ok(body.data.every((log) => log.module === 'Production' && log.userId === 'usr-pm'));
  currentToken = null;
});

test('work item status mutation creates one audit and no-op creates none', async () => {
  // Login as foreman
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'joko.anwar@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const beforeCount = await get(db, 'SELECT COUNT(*) AS count FROM audit_logs');
  const updated = await request('/api/work-items/wi-002/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Done' }),
  });

  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.status, 'Done');
  assert.equal(updated.body.meta.auditCreated, true);

  const afterUpdateCount = await get(db, 'SELECT COUNT(*) AS count FROM audit_logs');
  assert.equal(afterUpdateCount.count, beforeCount.count + 1);

  const noOp = await request('/api/work-items/wi-002/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Done' }),
  });
  assert.equal(noOp.response.status, 200);
  assert.equal(noOp.body.meta.auditCreated, false);

  const afterNoOpCount = await get(db, 'SELECT COUNT(*) AS count FROM audit_logs');
  assert.equal(afterNoOpCount.count, afterUpdateCount.count);
  
  currentToken = null; // reset
});

test('unauthorized or invalid token requests return 401 errors', async () => {
  // Try status patch without token
  const noToken = await request('/api/work-items/wi-006/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'In-Progress' }),
  });
  assert.equal(noToken.response.status, 401);
  assert.equal(noToken.body.error.code, 'UNAUTHORIZED');

  // Try status patch with invalid token
  const invalidToken = await request('/api/work-items/wi-006/status', {
    method: 'PATCH',
    headers: { Authorization: 'Bearer invalid-token-value' },
    body: JSON.stringify({ status: 'In-Progress' }),
  });
  assert.equal(invalidToken.response.status, 401);
  assert.equal(invalidToken.body.error.code, 'INVALID_TOKEN');

  for (const path of ['/api/users', '/api/audit-logs', '/api/qc-checklists']) {
    const protectedRead = await request(path);
    assert.equal(protectedRead.response.status, 401, path);
    assert.equal(protectedRead.body.error.code, 'UNAUTHORIZED', path);
  }
});

test('role-specific mutation endpoints reject unauthorized roles', async () => {
  const ownerLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'rina.wijaya@simo.test', password: 'password' }),
  });
  currentToken = ownerLogin.body.data.token;

  const ownerProductionUpdate = await request('/api/work-items/wi-001/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Done' }),
  });
  assert.equal(ownerProductionUpdate.response.status, 403);
  assert.equal(ownerProductionUpdate.body.error.code, 'FORBIDDEN');

  const ownerQcSubmit = await request('/api/qc-checklists', {
    method: 'POST',
    body: JSON.stringify({
      workItemId: 'wi-003',
      materialName: 'Window Lockset A',
      length: 120,
      width: 40,
      thickness: 2,
      qcStatus: 'Passed QC',
      notes: 'Owner should not submit QC.',
    }),
  });
  assert.equal(ownerQcSubmit.response.status, 403);
  assert.equal(ownerQcSubmit.body.error.code, 'FORBIDDEN');

  const foremanLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'joko.anwar@simo.test', password: 'password' }),
  });
  currentToken = foremanLogin.body.data.token;

  const foremanLogistics = await request('/api/logistics/manifests');
  assert.equal(foremanLogistics.response.status, 403);
  assert.equal(foremanLogistics.body.error.code, 'FORBIDDEN');

  for (const path of ['/api/users', '/api/audit-logs', '/api/qc-checklists']) {
    const protectedRead = await request(path);
    assert.equal(protectedRead.response.status, 403, path);
    assert.equal(protectedRead.body.error.code, 'FORBIDDEN', path);
  }

  currentToken = null;
});

test('QC submission updates shipping gate and creates an audit log', async () => {
  // Login as QC inspector
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'siti.nurhaliza@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const beforeCount = await get(db, 'SELECT COUNT(*) AS count FROM audit_logs');
  const created = await request('/api/qc-checklists', {
    method: 'POST',
    body: JSON.stringify({
      workItemId: 'wi-003',
      materialName: 'Window Lockset A',
      length: 120,
      width: 40,
      thickness: 2,
      qcStatus: 'Passed QC',
      notes: 'Dimensions accepted.',
      evidencePhotoReference: 'lockset-a.jpg',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.projectId, 'prj-ikn-a');
  assert.equal(created.body.data.warehouseId, 'wh-hardware');

  const item = await request('/api/work-items/wi-003');
  assert.equal(item.body.data.qcStatus, 'Passed QC');
  assert.equal(item.body.data.readyToShip, true);

  const afterCount = await get(db, 'SELECT COUNT(*) AS count FROM audit_logs');
  assert.equal(afterCount.count, beforeCount.count + 1);

  currentToken = null; // reset
});

test('valid QC evidence upload stores generated image reference', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'siti.nurhaliza@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const pngBytes = Uint8Array.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
  ]);
  const form = new FormData();
  form.append('workItemId', 'wi-004');
  form.append('materialName', 'Custom Mullion Profile');
  form.append('length', '120');
  form.append('width', '40');
  form.append('thickness', '2');
  form.append('qcStatus', 'Rework');
  form.append('notes', 'Valid PNG evidence should be stored.');
  form.append('evidencePhoto', new Blob([pngBytes], { type: 'image/png' }), 'evidence.png');

  const created = await request('/api/qc-checklists', {
    method: 'POST',
    body: form,
  });

  assert.equal(created.response.status, 201);
  assert.match(created.body.data.evidencePhotoReference, /^qc-[0-9a-f-]+\.png$/);

  const evidenceFilename = created.body.data.evidencePhotoReference;
  const publicEvidence = await fetch(`${baseUrl}/uploads/${evidenceFilename}`);
  assert.equal(publicEvidence.status, 404);

  const noTokenEvidence = await fetch(`${baseUrl}/api/qc-checklists/evidence/${evidenceFilename}`);
  assert.equal(noTokenEvidence.status, 401);

  const authenticatedEvidence = await fetch(`${baseUrl}/api/qc-checklists/evidence/${evidenceFilename}`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });
  assert.equal(authenticatedEvidence.status, 200);
  assert.equal(authenticatedEvidence.headers.get('content-type'), 'image/png');

  currentToken = null;
});

test('invalid QC evidence upload returns a client error', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'siti.nurhaliza@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const form = new FormData();
  form.append('workItemId', 'wi-003');
  form.append('materialName', 'Window Lockset A');
  form.append('length', '120');
  form.append('width', '40');
  form.append('thickness', '2');
  form.append('qcStatus', 'Rework');
  form.append('notes', 'Invalid evidence type should be rejected.');
  form.append('evidencePhoto', new Blob(['not an image'], { type: 'text/plain' }), 'evidence.txt');

  const invalidEvidence = await request('/api/qc-checklists', {
    method: 'POST',
    body: form,
  });

  assert.equal(invalidEvidence.response.status, 400);
  assert.equal(invalidEvidence.body.error.code, 'INVALID_EVIDENCE_FILE');

  const spoofedForm = new FormData();
  spoofedForm.append('workItemId', 'wi-003');
  spoofedForm.append('materialName', 'Window Lockset A');
  spoofedForm.append('length', '120');
  spoofedForm.append('width', '40');
  spoofedForm.append('thickness', '2');
  spoofedForm.append('qcStatus', 'Rework');
  spoofedForm.append('notes', 'Spoofed evidence type should be rejected.');
  spoofedForm.append('evidencePhoto', new Blob(['not an image'], { type: 'image/png' }), 'evidence.png');

  const spoofedEvidence = await request('/api/qc-checklists', {
    method: 'POST',
    body: spoofedForm,
  });

  assert.equal(spoofedEvidence.response.status, 400);
  assert.equal(spoofedEvidence.body.error.code, 'INVALID_EVIDENCE_FILE');

  currentToken = null;
});

test('logistics status update supports Arrived without server errors', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const updated = await request('/api/logistics/manifests/lm-demo-002/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Arrived' }),
  });

  assert.equal(updated.response.status, 200);
  assert.equal(updated.body.data.deliveryStatus, 'Arrived');
  assert.equal(updated.body.meta.auditCreated, true);
  assert.ok(updated.body.data.arrivalTime);

  currentToken = null;
});

test('manual logistics check-in stores and returns notes', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const created = await request('/api/logistics/manifests/lm-demo-001/checkins', {
    method: 'POST',
    body: JSON.stringify({
      status: 'On Delivery',
      locationText: 'Rest Area KM 57',
      notes: '  Barang diterima sebagian, menunggu konfirmasi lokasi.  ',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.data.locationText, 'Rest Area KM 57');
  assert.equal(created.body.data.notes, 'Barang diterima sebagian, menunggu konfirmasi lokasi.');

  const stored = await get(db, 'SELECT notes FROM delivery_checkins WHERE id = ?', [created.body.data.id]);
  assert.equal(stored.notes, 'Barang diterima sebagian, menunggu konfirmasi lokasi.');

  const manifests = await request('/api/logistics/manifests');
  assert.equal(manifests.response.status, 200);
  const manifest = manifests.body.data.find((item) => item.id === 'lm-demo-001');
  assert.equal(manifest.latestCheckin.notes, 'Barang diterima sebagian, menunggu konfirmasi lokasi.');

  const emptyNotes = await request('/api/logistics/manifests/lm-demo-001/checkins', {
    method: 'POST',
    body: JSON.stringify({ status: 'On Delivery', locationText: 'Rest Area KM 58', notes: '   ' }),
  });
  assert.equal(emptyNotes.response.status, 201);
  assert.equal(emptyNotes.body.data.notes, '');

  currentToken = null;
});

test('logistics tracking token regeneration revokes old driver link', async () => {
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const regenerated = await request('/api/logistics/manifests/lm-demo-003/tracking-token/regenerate', {
    method: 'POST',
  });

  assert.equal(regenerated.response.status, 200);
  assert.notEqual(regenerated.body.data.trackingToken, 'track-lm-demo-003');
  assert.equal(regenerated.body.meta.auditCreated, true);
  currentToken = null;

  const oldTokenWrite = await request('/api/logistics/manifests/lm-demo-003/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
      trackingToken: 'track-lm-demo-003',
    }),
  });
  assert.equal(oldTokenWrite.response.status, 403);
  assert.equal(oldTokenWrite.body.error.code, 'INVALID_TRACKING_TOKEN');

  const newTokenWrite = await request('/api/logistics/manifests/lm-demo-003/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
      trackingToken: regenerated.body.data.trackingToken,
    }),
  });
  assert.equal(newTokenWrite.response.status, 201);
});

test('logistics GPS endpoints store and return latest demo location', async () => {
  const emptyLatest = await request('/api/logistics/manifests/lm-demo-002/locations/latest?trackingToken=track-lm-demo-002');
  assert.equal(emptyLatest.response.status, 200);
  assert.equal(emptyLatest.body.success, true);
  assert.equal(emptyLatest.body.data, null);
  assert.equal(emptyLatest.body.message, 'No GPS location has been received for this manifest yet.');

  const emptyHistory = await request('/api/logistics/manifests/lm-demo-002/locations/history?limit=50&trackingToken=track-lm-demo-002');
  assert.equal(emptyHistory.response.status, 200);
  assert.equal(emptyHistory.body.success, true);
  assert.deepEqual(emptyHistory.body.data, []);
  assert.equal(emptyHistory.body.message, 'No GPS location has been received for this manifest yet.');

  const created = await request('/api/logistics/manifests/lm-demo-001/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
      accuracy: 15,
      speed: null,
      heading: null,
      source: 'driver_geolocation',
      trackingToken: 'track-lm-demo-001',
    }),
  });

  assert.equal(created.response.status, 201);
  assert.equal(created.body.success, true);
  assert.equal(created.body.message, 'Location recorded successfully');
  assert.equal(created.body.data.manifestId, 'lm-demo-001');
  assert.ok(Math.abs(created.body.data.latitude - (-6.2)) < 0.000001);
  assert.ok(Math.abs(created.body.data.longitude - 106.816666) < 0.000001);
  assert.equal(created.body.data.accuracy, 15);
  assert.equal(created.body.data.recordedBy, null);
  assert.equal(created.body.data.source, 'driver_geolocation');

  const stored = await get(db, 'SELECT COUNT(*) AS count FROM logistics_locations WHERE manifest_id = ?', ['lm-demo-001']);
  assert.equal(stored.count, 1);

  const latest = await request('/api/logistics/manifests/lm-demo-001/locations/latest?trackingToken=track-lm-demo-001');
  assert.equal(latest.response.status, 200);
  assert.equal(latest.body.success, true);
  assert.equal(latest.body.data.id, created.body.data.id);

  const history = await request('/api/logistics/manifests/lm-demo-001/locations/history?limit=50&trackingToken=track-lm-demo-001');
  assert.equal(history.response.status, 200);
  assert.equal(history.body.success, true);
  assert.ok(Array.isArray(history.body.data));
  assert.equal(history.body.meta.limit, 50);
  assert.ok(history.body.data.some((location) => location.id === created.body.data.id));

  const limitedHistory = await request('/api/logistics/manifests/lm-demo-001/locations/history?limit=1&trackingToken=track-lm-demo-001');
  assert.equal(limitedHistory.response.status, 200);
  assert.equal(limitedHistory.body.data.length, 1);
});

test('logistics GPS endpoints validate payloads and manifest ids', async () => {

  const missingTrackingToken = await request('/api/logistics/manifests/lm-demo-001/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
    }),
  });

  assert.equal(missingTrackingToken.response.status, 401);
  assert.equal(missingTrackingToken.body.error.code, 'TRACKING_TOKEN_REQUIRED');

  const invalidTrackingToken = await request('/api/logistics/manifests/lm-demo-001/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
      trackingToken: 'wrong-token',
    }),
  });

  assert.equal(invalidTrackingToken.response.status, 403);
  assert.equal(invalidTrackingToken.body.error.code, 'INVALID_TRACKING_TOKEN');

  const invalidCoordinate = await request('/api/logistics/manifests/lm-demo-001/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -91,
      longitude: 106.816666,
      accuracy: 15,
      trackingToken: 'track-lm-demo-001',
    }),
  });

  assert.equal(invalidCoordinate.response.status, 400);
  assert.equal(invalidCoordinate.body.error.code, 'VALIDATION_ERROR');
  assert.equal(invalidCoordinate.body.error.details.field, 'latitude');

  const missingManifest = await request('/api/logistics/manifests/missing-manifest/locations', {
    method: 'POST',
    body: JSON.stringify({
      latitude: -6.2,
      longitude: 106.816666,
    }),
  });

  assert.equal(missingManifest.response.status, 404);
  assert.equal(missingManifest.body.error.code, 'NOT_FOUND');

  const invalidToken = await request('/api/logistics/manifests/lm-demo-001/locations/latest', {
    headers: { Authorization: 'Bearer invalid-token-value' },
  });

  assert.equal(invalidToken.response.status, 401);
  assert.equal(invalidToken.body.error.code, 'INVALID_TOKEN');

  const invalidLimit = await request('/api/logistics/manifests/lm-demo-001/locations/history?limit=abc&trackingToken=track-lm-demo-001');
  assert.equal(invalidLimit.response.status, 400);
  assert.equal(invalidLimit.body.error.code, 'VALIDATION_ERROR');
  assert.equal(invalidLimit.body.error.details.field, 'limit');
});

test('invalid IDs, payloads, users, and routes return consistent errors', async () => {
  // Login as admin
  const loginRes = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'password' }),
  });
  currentToken = loginRes.body.data.token;

  const cases = [
    ['/api/users/missing', {}, 404, 'NOT_FOUND'],
    ['/api/work-items/wi-001/status', {
      method: 'PATCH',
      body: JSON.stringify({ status: 'Invalid' }),
    }, 400, 'VALIDATION_ERROR'],
    ['/api/qc-checklists', {
      method: 'POST',
      body: JSON.stringify({ workItemId: 'wi-001' }),
    }, 400, 'VALIDATION_ERROR'],
    ['/api/missing', {}, 404, 'ROUTE_NOT_FOUND'],
  ];

  for (const [path, options, expectedStatus, expectedCode] of cases) {
    const { response, body } = await request(path, options);
    assert.equal(response.status, expectedStatus, path);
    assert.equal(body.error.code, expectedCode, path);
  }

  currentToken = null; // reset
});

test('seed command remains idempotent', async () => {
  const tables = [
    'roles',
    'users',
    'projects',
    'warehouses',
    'work_items',
    'qc_checklists',
    'logistics_manifests',
    'delivery_checkins',
    'logistics_locations',
    'audit_logs',
    'account_invites',
    'password_reset_tokens',
    'email_outbox',
  ];
  const beforeCounts = {};

  for (const table of tables) {
    beforeCounts[table] = (await get(db, `SELECT COUNT(*) AS count FROM ${table}`)).count;
  }

  await seedDatabase({ db });
  await seedDatabase({ db });

  for (const table of tables) {
    const afterCount = (await get(db, `SELECT COUNT(*) AS count FROM ${table}`)).count;
    assert.equal(afterCount, beforeCounts[table], table);
  }
});

test('account lifecycle schema is initialized', async () => {
  const superAdmin = await get(
    db,
    `SELECT u.account_status, r.name AS role_name
       FROM users u
       JOIN roles r ON r.id = u.role_id
      WHERE u.id = ?`,
    ['usr-super-admin'],
  );

  assert.equal(superAdmin.account_status, 'ACTIVE');
  assert.equal(superAdmin.role_name, 'Super Admin');

  for (const table of ['account_invites', 'password_reset_tokens', 'email_outbox']) {
    const row = await get(db, `SELECT COUNT(*) AS count FROM ${table}`);
    assert.equal(row.count, 0, table);
  }
});

test('super admin invite activates account with one-time token', async () => {
  await loginAs('super.admin@simo.test');

  const invite = await request('/api/users/invites', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Invite Test User',
      email: 'invite.test@simo.test',
      roleId: 'foreman',
      site: 'Test Bay',
    }),
  });
  assert.equal(invite.response.status, 201);
  assert.equal(invite.body.data.user.accountStatus, 'INVITED');
  assert.ok(invite.body.data.delivery.inviteToken.startsWith('invite_'));
  const storedInvite = await get(db, 'SELECT token_hash FROM account_invites WHERE user_id = ?', [invite.body.data.user.id]);
  assert.notEqual(storedInvite.token_hash, invite.body.data.delivery.inviteToken);
  const inviteOutbox = await get(db, 'SELECT payload_json FROM email_outbox WHERE recipient_email = ?', ['invite.test@simo.test']);
  assert.equal(inviteOutbox.payload_json.includes(invite.body.data.delivery.inviteToken), false);

  currentToken = null;
  const blockedLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'invite.test@simo.test', password: 'NewPass123' }),
  });
  assert.equal(blockedLogin.response.status, 401);

  const accepted = await request('/api/auth/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token: invite.body.data.delivery.inviteToken, password: 'NewPass123' }),
  });
  assert.equal(accepted.response.status, 200);
  assert.equal(accepted.body.data.user.accountStatus, 'ACTIVE');

  const reused = await request('/api/auth/invites/accept', {
    method: 'POST',
    body: JSON.stringify({ token: invite.body.data.delivery.inviteToken, password: 'NewPass123' }),
  });
  assert.equal(reused.response.status, 400);
  assert.equal(reused.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');

  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'invite.test@simo.test', password: 'NewPass123' }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.user.email, 'invite.test@simo.test');
});

test('forgot password uses generic response and one-time reset token', async () => {
  const missing = await request('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: 'missing@simo.test' }),
  });
  assert.equal(missing.response.status, 200);
  assert.equal(missing.body.data.delivery, undefined);

  const forgot = await request('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test' }),
  });
  assert.equal(forgot.response.status, 200);
  assert.ok(forgot.body.data.delivery.resetToken.startsWith('reset_'));

  const reset = await request('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token: forgot.body.data.delivery.resetToken, password: 'Changed123' }),
  });
  assert.equal(reset.response.status, 200);

  const reused = await request('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token: forgot.body.data.delivery.resetToken, password: 'Changed123' }),
  });
  assert.equal(reused.response.status, 400);
  assert.equal(reused.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');

  const oldLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'password' }),
  });
  assert.equal(oldLogin.response.status, 401);

  const newLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'Changed123' }),
  });
  assert.equal(newLogin.response.status, 200);
});




test('auth rate limiting blocks repeated sensitive requests without breaking normal login', async () => {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const failed = await request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'rate.limit@simo.test', password: 'wrong-password' }),
    });
    assert.equal(failed.response.status, 401);
  }

  const limited = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'rate.limit@simo.test', password: 'wrong-password' }),
  });
  assert.equal(limited.response.status, 429);
  assert.equal(limited.body.error.code, 'RATE_LIMITED');

  resetRateLimitersForTests();
  const forgotPayload = { email: 'dewi.lestari@simo.test' };
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const forgot = await request('/api/auth/password/forgot', {
      method: 'POST',
      body: JSON.stringify(forgotPayload),
    });
    assert.equal(forgot.response.status, 200);
  }
  const forgotLimited = await request('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify(forgotPayload),
  });
  assert.equal(forgotLimited.response.status, 429);

  resetRateLimitersForTests();
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'super.admin@simo.test', password: 'password' }),
  });
  assert.equal(login.response.status, 200);
  assert.equal(login.body.data.user.email, 'super.admin@simo.test');
});

test('password reset revokes old JWT and new login receives fresh token version', async () => {
  await loginAs('super.admin@simo.test');
  const invited = await request('/api/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify({ name: 'Revoked Token User', email: 'revoked.token@simo.test', roleId: 'foreman' }),
  });
  assert.equal(invited.response.status, 201);

  currentToken = null;
  const accepted = await request('/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify({ token: invited.body.data.delivery.inviteToken, password: 'Start123' }),
  });
  assert.equal(accepted.response.status, 200);

  const login = await loginAs('revoked.token@simo.test', 'Start123');
  assert.equal(login.response.status, 200);
  const oldToken = currentToken;

  const beforeReset = await request('/api/work-items/wi-001/status', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${oldToken}` },
    body: JSON.stringify({ status: 'In-Progress' }),
  });
  assert.equal(beforeReset.response.status, 200);

  const forgot = await request('/api/auth/password/forgot', {
    method: 'POST',
    body: JSON.stringify({ email: 'revoked.token@simo.test' }),
  });
  assert.equal(forgot.response.status, 200);

  const reset = await request('/api/auth/password/reset', {
    method: 'POST',
    body: JSON.stringify({ token: forgot.body.data.delivery.resetToken, password: 'Changed123' }),
  });
  assert.equal(reset.response.status, 200);

  const stale = await request('/api/work-items/wi-002/status', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${oldToken}` },
    body: JSON.stringify({ status: 'In-Progress' }),
  });
  assert.equal(stale.response.status, 401);
  assert.equal(stale.body.error.code, 'TOKEN_REVOKED');

  const newLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'revoked.token@simo.test', password: 'Changed123' }),
  });
  assert.equal(newLogin.response.status, 200);
  currentToken = newLogin.body.data.token;

  const fresh = await request('/api/work-items/wi-002/status', {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Done' }),
  });
  assert.equal(fresh.response.status, 200);
});
test('super admin can read account lifecycle audit logs', async () => {
  await loginAs('super.admin@simo.test');

  const response = await request('/api/audit-logs?module=AccountLifecycle');
  assert.equal(response.response.status, 200);
  assert.ok(Array.isArray(response.body.data));
});

test('admin lifecycle endpoints enforce super admin and status safety', async () => {
  await loginAs('rina.wijaya@simo.test');
  const forbidden = await request('/api/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify({ name: 'Nope', email: 'nope@simo.test', roleId: 'foreman' }),
  });
  assert.equal(forbidden.response.status, 403);

  await loginAs('super.admin@simo.test');
  const invited = await request('/api/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify({ name: 'Admin API User', email: 'admin.api@simo.test', roleId: 'foreman' }),
  });
  assert.equal(invited.response.status, 201);
  assert.ok(invited.body.data.delivery.inviteUrl.includes('/accept-invite?token='));

  const list = await request('/api/admin/users');
  assert.equal(list.response.status, 200);
  assert.ok(list.body.data.some((user) => user.email === 'admin.api@simo.test'));

  const disabled = await request(`/api/admin/users/${invited.body.data.user.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'DISABLED' }),
  });
  assert.equal(disabled.response.status, 200);
  assert.equal(disabled.body.data.accountStatus, 'DISABLED');

  currentToken = null;
  const login = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'admin.api@simo.test', password: 'AnyPass123' }),
  });
  assert.equal(login.response.status, 401);
});

test('account token preview is hidden unless explicitly enabled', async () => {
  const previousPreview = process.env.ENABLE_DEV_TOKEN_PREVIEW;
  process.env.ENABLE_DEV_TOKEN_PREVIEW = 'false';
  try {
    await loginAs('super.admin@simo.test');
    const invited = await request('/api/admin/users/invite', {
      method: 'POST',
      body: JSON.stringify({ name: 'Hidden Preview User', email: 'hidden.preview@simo.test', roleId: 'foreman' }),
    });
    assert.equal(invited.response.status, 201);
    assert.equal(invited.body.data.delivery.to, 'hidden.preview@simo.test');
    assert.equal(invited.body.data.delivery.inviteToken, undefined);
    assert.equal(invited.body.data.delivery.inviteUrl, undefined);
    assert.equal(invited.body.data.delivery.previewUrl, undefined);
  } finally {
    process.env.ENABLE_DEV_TOKEN_PREVIEW = previousPreview;
  }
});

test('super admin can send reset password email for another active user', async () => {
  await loginAs('rina.wijaya@simo.test');
  const forbidden = await request('/api/admin/users/usr-super-admin/reset-password', { method: 'POST' });
  assert.equal(forbidden.response.status, 403);

  await loginAs('super.admin@simo.test');
  const target = await get(db, 'SELECT id, token_version FROM users WHERE email = ?', ['budi.santoso@simo.test']);
  const response = await request(`/api/admin/users/${target.id}/reset-password`, { method: 'POST' });
  assert.equal(response.response.status, 200);
  assert.equal(response.body.data.message, 'Instruksi reset password sudah dikirim ke email user.');
  assert.equal(response.body.data.delivery.to, 'budi.santoso@simo.test');
  assert.ok(response.body.data.delivery.resetUrl.includes('/reset-password?token='));
  assert.equal(JSON.stringify(response.body.data).includes('password_hash'), false);

  const updated = await get(db, 'SELECT token_version FROM users WHERE id = ?', [target.id]);
  assert.equal(Number(updated.token_version), Number(target.token_version) + 1);

  const tokenRow = await get(db, 'SELECT token_hash FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC', [target.id]);
  assert.ok(tokenRow.token_hash);
  assert.equal(tokenRow.token_hash.includes('/reset-password?token='), false);

  const logs = await request('/api/audit-logs?module=User%20Management');
  assert.ok(logs.body.data.some((log) => log.actionType === 'ADMIN_RESET_PASSWORD' && log.entityId === target.id));
});

test('admin user list is sorted by newest account activity', async () => {
  await loginAs('super.admin@simo.test');
  await run(db, "UPDATE users SET last_activity_at = '2000-01-01T00:00:00.000Z'");

  const target = await get(db, 'SELECT id FROM users WHERE email = ?', ['joko.anwar@simo.test']);
  const updated = await request(`/api/admin/users/${target.id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'SUSPENDED' }),
  });
  assert.equal(updated.response.status, 200);
  assert.ok(updated.body.data.lastActivityAt);

  const list = await request('/api/admin/users');
  assert.equal(list.response.status, 200);
  assert.equal(list.body.data[0].id, target.id);
  assert.ok(list.body.data[0].lastActivityAt);

  await run(db, "UPDATE users SET account_status = 'ACTIVE', is_active = 1 WHERE id = ?", [target.id]);
});

test('expired invite token is rejected', async () => {
  await loginAs('super.admin@simo.test');
  const invited = await request('/api/admin/users/invite', {
    method: 'POST',
    body: JSON.stringify({ name: 'Expired User', email: 'expired.user@simo.test', roleId: 'foreman' }),
  });
  assert.equal(invited.response.status, 201);
  const row = await get(db, 'SELECT id FROM account_invites WHERE user_id = ?', [invited.body.data.user.id]);
  const { run } = await import('../db/database.js');
  await run(db, 'UPDATE account_invites SET expires_at = ? WHERE id = ?', ['2000-01-01T00:00:00.000Z', row.id]);

  currentToken = null;
  const accepted = await request('/api/auth/invite/accept', {
    method: 'POST',
    body: JSON.stringify({ token: invited.body.data.delivery.inviteToken, password: 'NewPass123', confirmPassword: 'NewPass123' }),
  });
  assert.equal(accepted.response.status, 400);
  assert.equal(accepted.body.error.code, 'INVALID_OR_EXPIRED_TOKEN');
});

test('auth lifecycle audit events do not store secrets', async () => {
  const loginFailure = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'dewi.lestari@simo.test', password: 'wrong-password' }),
  });
  assert.equal(loginFailure.response.status, 401);

  await loginAs('super.admin@simo.test');
  const rows = await request('/api/audit-logs?module=Auth');
  assert.equal(rows.response.status, 200);
  assert.ok(rows.body.data.some((log) => ['LOGIN_SUCCESS', 'LOGIN_FAILED'].includes(log.actionType)));
  assert.equal(JSON.stringify(rows.body.data).includes('wrong-password'), false);
});

test('reports preview and CSV export enforce auth, RBAC, and audit logging', async () => {
  const noToken = await request('/api/reports/production/preview?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(noToken.response.status, 401);

  await loginAs('siti.nurhaliza@simo.test');
  const forbidden = await request('/api/reports/logistics/preview?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(forbidden.response.status, 403);

  await loginAs('super.admin@simo.test');
  const invalidPeriod = await request('/api/reports/production/preview?startDate=2026-12-31&endDate=2026-01-01');
  assert.equal(invalidPeriod.response.status, 400);
  assert.equal(invalidPeriod.body.error.code, 'INVALID_REPORT_PERIOD');

  const invalidType = await request('/api/reports/missing/preview?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(invalidType.response.status, 404);
  assert.equal(invalidType.body.error.code, 'REPORT_NOT_FOUND');

  const preview = await request('/api/reports/production/preview?startDate=2026-01-01&endDate=2026-12-31');
  assert.equal(preview.response.status, 200);
  assert.equal(preview.body.data.type, 'production');
  assert.equal(preview.body.data.generatedBy.email, undefined);
  assert.ok(Array.isArray(preview.body.data.rows));
  assert.equal(JSON.stringify(preview.body.data).includes('password_hash'), false);

  const beforeExport = await get(db, "SELECT COUNT(*) AS count FROM audit_logs WHERE module = 'Reports' AND action_type = 'EXPORT_REPORT_CSV'");
  const csvResponse = await fetch(`${baseUrl}/api/reports/production/export.csv?startDate=2026-01-01&endDate=2026-12-31`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });
  const csv = await csvResponse.text();
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type'), /text\/csv/);
  assert.match(csv, /Production Report/);
  assert.equal(csv.includes('password_hash'), false);

  const afterExport = await get(db, "SELECT COUNT(*) AS count FROM audit_logs WHERE module = 'Reports' AND action_type = 'EXPORT_REPORT_CSV'");
  assert.equal(Number(afterExport.count), Number(beforeExport.count) + 1);

  const beforePdfExport = await get(db, "SELECT COUNT(*) AS count FROM audit_logs WHERE module = 'Reports' AND action_type = 'EXPORT_REPORT_PDF'");
  const pdfResponse = await fetch(`${baseUrl}/api/reports/production/export.pdf?startDate=2026-01-01&endDate=2026-12-31`, {
    headers: { Authorization: `Bearer ${currentToken}` },
  });
  const pdf = await pdfResponse.arrayBuffer();
  assert.equal(pdfResponse.status, 200);
  assert.equal(pdfResponse.headers.get('content-type'), 'application/pdf');
  assert.equal(Buffer.from(pdf).subarray(0, 5).toString(), '%PDF-');

  const afterPdfExport = await get(db, "SELECT COUNT(*) AS count FROM audit_logs WHERE module = 'Reports' AND action_type = 'EXPORT_REPORT_PDF'");
  assert.equal(Number(afterPdfExport.count), Number(beforePdfExport.count) + 1);
});


test('super admin can change own password and old token is revoked', async () => {
  const login = await loginAs('super.admin@simo.test', 'password');
  assert.equal(login.response.status, 200);
  const oldToken = currentToken;

  const changed = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'password', newPassword: 'Password1!', confirmPassword: 'Password1!' }),
  });
  assert.equal(changed.response.status, 200);
  assert.equal(changed.body.data.message.includes('Password berhasil diubah'), true);

  const oldSession = await request('/api/audit-logs', { headers: { Authorization: `Bearer ${oldToken}` } });
  assert.equal(oldSession.response.status, 401);

  const oldLogin = await request('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email: 'super.admin@simo.test', password: 'password' }),
  });
  assert.equal(oldLogin.response.status, 401);

  const newLogin = await loginAs('super.admin@simo.test', 'Password1!');
  assert.equal(newLogin.response.status, 200);

  const restored = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'Password1!', newPassword: 'Password2!', confirmPassword: 'Password2!' }),
  });
  assert.equal(restored.response.status, 200);

  await loginAs('super.admin@simo.test', 'Password2!');
  const finalRestore = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'Password2!', newPassword: 'password', confirmPassword: 'password' }),
  });
  assert.equal(finalRestore.response.status, 400);
});

test('change password rejects missing auth and non-super-admin users', async () => {
  const unauthenticated = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'password', newPassword: 'Password1!', confirmPassword: 'Password1!' }),
  });
  assert.equal(unauthenticated.response.status, 401);

  await loginAs('joko.anwar@simo.test', 'password');
  const forbidden = await request('/api/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ currentPassword: 'password', newPassword: 'Password1!', confirmPassword: 'Password1!' }),
  });
  assert.equal(forbidden.response.status, 403);
});
