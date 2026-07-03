# Security Remediation Plan

## Scope

Phase 0 scan completed on branch `security/remediation-baseline`, based on `development`.

Scanned required paths:

- `package.json`
- `README.md`
- `.gitignore`
- `frontend/package.json`
- `frontend/src/services/apiClient.js`
- `frontend/src/context/AppDataContext.jsx`
- `frontend/src/context/AppDataCore.js`
- `frontend/src/pages/Login.jsx`
- `frontend/src/App.jsx`
- `backend/package.json`
- `backend/.env.example`
- `backend/server/app.js`
- `backend/server/index.js`
- `backend/server/routes/auth.js`
- `backend/server/routes/users.js`
- `backend/server/routes/auditLogs.js`
- `backend/server/routes/qcChecklists.js`
- `backend/server/routes/logistics.js`
- `backend/server/utils/auth.js`
- `backend/server/db/database.js`

Missing paths noted during scan:

- `docs/` does not exist.
- `backend/server/middleware/` does not exist.

## Confirmed Critical Findings

| Risk | Finding | Evidence | Affected Files |
| --- | --- | --- | --- |
| Critical | Seeded users can authenticate with shared literal password `password`. | Login route checks `password !== 'password'`; README documents same demo password. | `backend/server/routes/auth.js`, `README.md`, `backend/server/tests/api.test.js`, `frontend/src/pages/Login.jsx` |
| Critical | JWT secret has insecure hardcoded fallback. | `JWT_SECRET` falls back to `simo-mugi-jaya-secret-key`. | `backend/server/utils/auth.js`, `backend/server/routes/auth.js` |
| Critical | Database URL has hardcoded credential fallback. | Default PostgreSQL URL uses `postgres:postgres`. | `backend/server/db/database.js` |
| Critical | Users endpoint is public. | `GET /api/users` and `GET /api/users/:id` have no `requireAuth` or role guard. | `backend/server/routes/users.js` |
| Critical | Audit logs endpoint is public. | `GET /api/audit-logs` has no `requireAuth` or role guard. | `backend/server/routes/auditLogs.js` |

## Confirmed Medium Findings

| Risk | Finding | Evidence | Affected Files |
| --- | --- | --- | --- |
| Medium | QC checklist list/detail is public. | `GET /api/qc-checklists` and `GET /api/qc-checklists/:id` have no auth guard. | `backend/server/routes/qcChecklists.js` |
| Medium | Upload validation trusts MIME type only. | `file.mimetype.startsWith('image/')` is only type check. | `backend/server/routes/qcChecklists.js` |
| Medium | Upload folder is fully public. | `express.static` serves `/uploads`. | `backend/server/app.js`, `backend/server/routes/qcChecklists.js` |
| Medium | JWT token is stored in `localStorage`. | API client and context read/write `simo-mugi-jaya-token`. | `frontend/src/services/apiClient.js`, `frontend/src/context/AppDataContext.jsx` |
| Medium | Logistics tracking endpoints allow optional auth. | Location write/read routes use `optionalAuth`. | `backend/server/routes/logistics.js` |

## Dependency And Test Baseline Findings

- Root script `install:all` exists.
- Backend test failed before remediation because `cors` was not installed in `backend/node_modules`.
- Frontend test failed before remediation because `vitest` was not installed in `frontend/node_modules`.
- Likely fix: run `npm run install:all`; do not add unused packages.

## Fix Priority Order

1. Restore dependency baseline with existing manifests.
2. Remove JWT secret fallback and fail safely when `JWT_SECRET` is missing.
3. Remove database credential fallback and require explicit `DATABASE_URL` / `DATABASE_URL_TEST`.
4. Replace shared demo password logic with hashed seeded-password verification.
5. Protect `/api/users` using auth plus Admin/Owner role guard.
6. Protect `/api/audit-logs` using auth plus Admin/Owner role guard.
7. Protect QC read endpoints with authenticated roles needed by demo flow.
8. Harden QC upload validation with extension allowlist and file signature checks where feasible.
9. Decide logistics tracking access model: short-lived tracking token preferred; documented demo limitation if not safe in time.
10. Document frontend `localStorage` JWT limitation unless cookie migration is safe and small.
11. Run backend tests, frontend tests, lint, build, and manual endpoint smoke checks.
12. Write `SECURITY_REMEDIATION_SUMMARY.md` with final results and remaining risks.

## Planned File Impact

Likely code changes:

- `backend/server/utils/auth.js`
- `backend/server/routes/auth.js`
- `backend/server/db/database.js`
- `backend/server/routes/users.js`
- `backend/server/routes/auditLogs.js`
- `backend/server/routes/qcChecklists.js`
- `backend/server/routes/logistics.js`
- `backend/server/seed/seedData.js`
- `backend/server/seed/seedDatabase.js`
- `backend/server/tests/api.test.js`
- `backend/package.json` only if existing dependencies are insufficient.
- `frontend/src/context/AppDataContext.jsx` only if token/demo storage behavior changes.
- `frontend/src/services/apiClient.js` only if auth transport changes.
- `README.md`

Documentation changes:

- `SECURITY_REMEDIATION_PLAN.md`
- `SECURITY_REMEDIATION_SUMMARY.md`

## Security Decisions

- Use existing dependencies first. Add package only if native or existing dependency cannot safely handle need.
- Fail closed for missing secrets or DB URLs in runtime.
- Preserve demo flows: login, dashboard, production update, QC submit, logistics, GPS tracking, audit log review.
- Use least privilege role guards for sensitive reads.
- Keep public upload serving only if replacing it would break demo; document as limitation if retained.
- Avoid cookie migration unless full login/logout/API flow remains stable within small diff.

## Safe Rollback Plan

1. Keep changes isolated on `security/remediation-baseline`.
2. Do not commit `.env`, secrets, tokens, or local database files.
3. Before each sprint, check `git status --short`.
4. If a sprint breaks demo flow, revert only files touched by that sprint.
5. Preserve `development` branch unchanged until remediation is reviewed.
6. If dependency install changes lockfiles unexpectedly, inspect diff before keeping changes.

## Verification Checklist

Dependency baseline:

- [ ] `npm run install:all`
- [ ] `npm --prefix backend test`
- [ ] `npm --prefix frontend test`
- [ ] `npm --prefix frontend run build`
- [ ] `npm --prefix frontend run lint`

Manual API security checks:

- [ ] No token: `GET /api/users` returns `401` or `403`.
- [ ] No token: `GET /api/audit-logs` returns `401` or `403`.
- [ ] No token: `GET /api/qc-checklists` returns `401` or `403` if protected.
- [ ] Admin token: `GET /api/users` works.
- [ ] Admin token: `GET /api/audit-logs` works.
- [ ] Foreman token: restricted users/audit endpoints are blocked.
- [ ] QC Inspector token: QC submit still works.
- [ ] Logistics GPS tracking works through chosen protected/demo-safe flow.

Manual UI smoke checks:

- [ ] Login works.
- [ ] Logout works.
- [ ] RBAC menu/page access still works.
- [ ] Dashboard loads.
- [ ] Warehouses update flow works.
- [ ] Production status update works.
- [ ] QC upload works.
- [ ] Logistics manifest flow works.
- [ ] Driver GPS tracking flow works.
- [ ] Audit logs page works for allowed roles.

## Phase 0 Status

Ready for Sprint 1 dependency and test baseline.

## Sprint 1 Baseline Results

Commands run:

- `npm run install:all`
- `npm --prefix backend test`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `npm --prefix frontend run lint`

Results:

| Check | Status | Notes |
| --- | --- | --- |
| Dependency install | Pass | Frontend and backend dependencies installed from existing manifests; npm audit reported 0 vulnerabilities for both installs. |
| Backend tests | Blocked | Tests now start, but all cases fail because local PostgreSQL rejects configured fallback credentials for user `postgres` with error code `28P01`. Missing `cors` issue is fixed by dependency install. |
| Frontend tests | Pass | Vitest ran 1 file and 2 tests successfully. |
| Frontend build | Pass | Vite production build completed; Vite reported existing chunk-size warning over 500 kB. |
| Frontend lint | Pass | ESLint completed successfully. |

Sprint 1 conclusion:

- Dependency reliability restored.
- Frontend baseline is healthy.
- Backend baseline is blocked by local database credential/configuration, not missing Node packages.
- Sprint 2 must remove unsafe database fallbacks and require explicit safe environment configuration.

## Sprint 2 Secret And Database Fallback Decisions

Applied decisions:

- `JWT_SECRET` is now required at app creation and token verification/signing time.
- The insecure JWT fallback `simo-mugi-jaya-secret-key` was removed.
- `DATABASE_URL` is now required for normal backend startup.
- `DATABASE_URL_TEST` is now required when tests call `createDatabase(':memory:')`.
- The insecure PostgreSQL fallback `postgres:postgres` was removed.
- Backend tests set only a test-only `JWT_SECRET`; they still require explicit test database configuration.

Security rationale:

- Missing secrets or database URLs now fail closed instead of silently using predictable credentials.
- Test configuration remains explicit so local developer credentials are not baked into source.
- Demo `.env.example` keeps placeholder values only and must be copied to `backend/.env` locally.

Expected Sprint 2 verification impact:

- Syntax checks should pass.
- Backend tests remain blocked until `DATABASE_URL_TEST` points to a valid local PostgreSQL test database.

## Sprint 2 Verification Results

Commands run:

- `node --check backend/server/db/database.js`
- `node --check backend/server/app.js`
- `node --check backend/server/utils/auth.js`
- `node --check backend/server/routes/auth.js`
- Missing `JWT_SECRET` runtime check via `node --input-type=module`
- Missing `DATABASE_URL` runtime check via `node --input-type=module`
- `npm --prefix backend test`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `npm --prefix frontend run lint`

Results:

| Check | Status | Notes |
| --- | --- | --- |
| Backend syntax checks | Pass | Modified backend files parse successfully. |
| Missing JWT secret check | Pass | `createApp` fails with clear `JWT_SECRET is required` error. |
| Missing database URL check | Pass | `createDatabase()` fails with clear `DATABASE_URL is required` error. |
| Insecure fallback scan | Pass | No active code references remain for `simo-mugi-jaya-secret-key`, `postgres:postgres`, `DEFAULT_DATABASE_URL`, or `DEFAULT_TEST_DATABASE_URL`. Historical findings remain in this plan. |
| Backend tests | Blocked | Tests now fail closed on missing `DATABASE_URL_TEST`; this is expected until `backend/.env` provides an explicit PostgreSQL test database URL. |
| Frontend tests | Pass | Vitest ran 1 file and 2 tests successfully. |
| Frontend build | Pass | Vite build completed with existing chunk-size warning. |
| Frontend lint | Pass | ESLint completed successfully. |

Sprint 2 conclusion:

- Hardcoded JWT fallback removed.
- Hardcoded database credential fallback removed.
- App now fails closed when required secrets/config are missing.
- Backend test cleanup now avoids secondary close errors when setup fails.
- Next sprint can safely address password handling.

## Pre-Sprint 3 Retest

Commands run after local `backend/.env` was available:

- `npm --prefix backend test`
- `npm --prefix frontend test`
- `npm --prefix frontend run build`
- `npm --prefix frontend run lint`

Results:

| Check | Status | Notes |
| --- | --- | --- |
| Backend tests | Pass | Node test runner passed 13/13 tests with explicit local `DATABASE_URL_TEST`. |
| Frontend tests | Pass | Vitest passed 1 file and 2 tests. |
| Frontend build | Pass | Vite build completed; existing chunk-size warning remains. |
| Frontend lint | Pass | ESLint completed successfully. |

Notes:

- `pg` emitted an SSL mode warning from the local connection string. Keep or adjust local `sslmode` based on deployment needs; no source change needed for Sprint 3.
- No `.env` contents were read into docs or committed.

## Pre-Sprint 3 Chunk Warning Fix

Change:

- `frontend/src/App.jsx` now lazy-loads route pages with React `lazy` and `Suspense`.
- Large logistics/map code is split into its own async chunk instead of inflating initial `index` bundle.

Verification:

| Check | Status | Notes |
| --- | --- | --- |
| Frontend build | Pass | Vite chunk warning is gone. Initial JS chunk dropped from about 511 kB to about 252 kB minified. |
| Frontend tests | Pass | Vitest passed 1 file and 2 tests. |
| Frontend lint | Pass | ESLint completed successfully. |
| Backend tests | Pass | Node test runner passed 13/13 tests. |

Bundle result:

- Initial JS chunk: `index-VZ_LVgYZ.js` at about 252 kB minified.
- Logistics async chunk: `Logistics-Bd2D5Nl5.js` at about 182 kB minified.
- No Vite >500 kB chunk warning remains.

## Sprint 3 Password Handling Results

Changes:

- Added `password_hash` column to `users` schema.
- Added startup migration for existing PostgreSQL databases to add `users.password_hash` when missing.
- Seed script now stores deterministic demo `scrypt` password hashes for seeded users and backfills existing empty hashes.
- Login now verifies submitted passwords against stored hashes instead of checking literal `password` in route code.
- Added password helper self-check covering valid password, wrong password, and plaintext rejection.
- README now states demo password is hashed by backend storage/verification.

Security rationale:

- Password verification no longer depends on a shared plaintext comparison in the auth route.
- Seeded demo users still use the classroom password for stable demos, but database storage uses one-way hashes.
- No new dependency was added; Node.js `crypto.scryptSync` and `timingSafeEqual` cover this use case.

Verification:

| Check | Status | Notes |
| --- | --- | --- |
| Backend syntax | Pass | Modified backend files parse successfully. |
| Backend tests | Pass | Node test runner passed 14/14 tests. |
| Frontend tests | Pass | Vitest passed 1 file and 2 tests. |
| Frontend build | Pass | Vite build completed with no chunk warning. |
| Frontend lint | Pass | ESLint completed successfully. |

Remaining limitation:

- Demo accounts still share password `password` for presentation flow. Production needs per-user password setup/reset and password policy.

## Sprint 4 Sensitive Route Protection Results

Changes:

- Added reusable `requireRoles(...roles)` auth guard.
- Protected `/api/users` and `/api/users/:id` with `requireAuth` plus `Admin`/`Owner` role guard.
- Protected `/api/audit-logs` with `requireAuth` plus `Admin`/`Owner` role guard.
- Updated backend tests so public collection tests exclude protected sensitive routes unless logged in as Admin.
- Added regression coverage for unauthenticated `401` and unauthorized Foreman `403` on users/audit endpoints.

Security rationale:

- User directory and audit activity are sensitive operational data.
- Admin and Owner keep demo visibility while lower-privilege operational roles are denied.
- Serializers already avoid returning `password_hash`; route protection now limits who can list users.

Verification:

| Check | Status | Notes |
| --- | --- | --- |
| Backend syntax | Pass | Modified auth/routes/tests parse successfully. |
| Backend tests | Pass | Node test runner passed 14/14 tests. |

Remaining limitation:

- Route-level role lists are still hardcoded. Add database-backed permission policy only when real user administration exists.

## Sprint 5 QC Read Protection Results

Changes:

- Protected `GET /api/qc-checklists` and `GET /api/qc-checklists/:id` with `requireAuth`.
- Added QC read role list: `Admin`, `Owner`, `Production Manager`, and `QC Inspector`.
- Kept QC submit restricted to `QC Inspector` and `Admin`.
- Updated backend tests for Admin allowed reads, unauthenticated `401`, and Foreman `403`.
- Updated frontend data loading to fetch protected users/audit/QC resources only for roles allowed to read each resource.
- Aligned audit log backend access with existing frontend permission by allowing `Production Manager` to read audit logs.

Security rationale:

- QC checklist data is no longer public.
- Dashboard/demo roles that need QC visibility can still load data.
- Foreman production flow no longer triggers protected QC/users/audit reads during global data refresh.

Verification:

| Check | Status | Notes |
| --- | --- | --- |
| Backend syntax | Pass | Modified QC/audit/test files parse successfully. |
| Backend tests | Pass | Node test runner passed 14/14 tests. |
| Frontend tests | Pass | Vitest passed 1 file and 2 tests. |
| Frontend build | Pass | Vite build completed with no chunk warning. |
| Frontend lint | Pass | ESLint completed successfully. |

Remaining limitation:

- Frontend role-to-endpoint read matrix is duplicated in client code. Centralize permissions when real RBAC policy storage exists.
