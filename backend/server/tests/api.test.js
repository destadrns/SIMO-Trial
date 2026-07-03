import assert from 'node:assert/strict';
import { after, before, beforeEach, test } from 'node:test';
import { createApp } from '../app.js';
import { closeDatabase, createDatabase, get } from '../db/database.js';
import { seedDatabase } from '../seed/seedDatabase.js';
import { hashPassword, verifyPassword } from '../utils/password.js';

process.env.JWT_SECRET ||= 'test-only-jwt-secret';

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

  await loginAs('dewi.lestari@simo.test');
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

  await loginAs('dewi.lestari@simo.test');
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
  await loginAs('dewi.lestari@simo.test');
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

