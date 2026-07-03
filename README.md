# SIMO Mugi Jaya

**SIMO Mugi Jaya** adalah sistem informasi operasional full-stack untuk mengelola alur kerja produksi, warehouse, quality control, audit trail, dan logistics tracking dalam satu dashboard modern.

Project ini sudah berbentuk **monorepo** dengan frontend React + Vite dan backend Express + PostgreSQL.

---

## Highlights

- **Dashboard Operations Control** untuk memantau progress project, warehouse, work item, QC, dan shipping readiness.
- **Master Data CRUD** untuk Project dan Warehouse.
- **Production Work Items** untuk update status pekerjaan produksi.
- **Digital QC Checklist** dengan evidence upload dan shipping gate.
- **Logistics Manifest** untuk status pengiriman, driver, kendaraan, rute, dan check-in.
- **Driver GPS Tracking** dengan real browser geolocation.
- **Demo GPS Route Simulator** agar live map tetap bisa didemokan tanpa bergantung izin GPS perangkat.
- **Admin Live Map** berbasis Leaflet + OpenStreetMap dengan marker, route polyline, dan signal status.
- **Audit Logs** untuk aktivitas penting seperti update produksi, QC, logistics, dan master data.
- **JWT Auth + Role-Based Access Control**.
- **Mobile-friendly UI improvements** untuk tampilan dashboard dan QC history.

---

## Tech Stack

### Frontend

- React 19
- Vite 8
- React Router
- Tailwind CSS v4
- Lucide React
- Leaflet + React Leaflet
- Vitest + Testing Library

### Backend

- Node.js
- Express 5
- PostgreSQL via `pg`
- JWT Authentication
- RBAC middleware
- Multer upload handling
- Node test runner

### Database

- PostgreSQL
- Schema initialized from `backend/server/db/schema.sql`

---

## Project Structure

```text
Simo MUGI JAYA/
├── frontend/                  # React + Vite frontend
│   ├── src/
│   │   ├── components/         # Shared UI and map components
│   │   ├── context/            # App state and auth context
│   │   ├── data/               # Demo seed data
│   │   ├── pages/              # App pages
│   │   └── services/           # API clients
│   ├── index.html
│   ├── package.json
│   └── .env.example
├── backend/                   # Express + PostgreSQL backend
│   ├── server/
│   │   ├── db/                 # DB helper and schema
│   │   ├── routes/             # API routes
│   │   ├── seed/               # Demo seed script
│   │   ├── tests/              # Backend API tests
│   │   └── utils/              # Auth, HTTP, serializers, audit logger
│   ├── package.json
│   └── .env.example
├── package.json               # Root convenience scripts
├── README.md
└── .gitignore
```

---

## Main Modules

## 1. Authentication & Roles

Login memakai JWT. Menu dan route dibatasi berdasarkan role.

Demo roles:

- Owner
- Production Manager
- Foreman
- QC Inspector
- Admin

Permission utama:

- Production update
- QC submission
- Logistics access
- Audit log view
- Master data management

---

## 2. Dashboard

Dashboard menampilkan ringkasan operasional:

- Total project
- Total warehouse
- Total work item
- Production completed
- Ready to ship
- Pending QC
- Project and warehouse progress

---

## 3. Master Data CRUD

Halaman **Master Data** menyediakan CRUD untuk:

### Project Master

- Create project
- Edit project
- Delete project jika belum dipakai data lain
- Status dan priority validation
- Audit log untuk create/update/delete

### Warehouse Master

- Create warehouse
- Edit warehouse
- Delete warehouse jika belum dipakai work item/QC
- Optional link ke project
- Audit log untuk create/update/delete

Endpoint utama:

```text
GET    /api/projects
POST   /api/projects
PUT    /api/projects/:id
DELETE /api/projects/:id

GET    /api/warehouses
POST   /api/warehouses
PUT    /api/warehouses/:id
DELETE /api/warehouses/:id
```

---

## 4. Production Work Items

Foreman, Production Manager, atau Admin dapat mengubah status work item:

- `To-Do`
- `In-Progress`
- `Done`

Setiap perubahan status masuk ke audit log.

---

## 5. Digital Quality Control

QC Inspector/Admin dapat submit checklist QC:

- Material
- Dimensi panjang/lebar/tebal
- QC status
- Notes
- Evidence photo

QC status:

- `Pending`
- `Passed QC`
- `Rework`

Jika item **Passed QC**, material dapat menjadi **Ready To Ship**.

---

## 6. Logistics & Delivery Tracking

Modul logistics mendukung:

- Manifest pengiriman
- Driver dan kendaraan
- Origin/destination
- Delivery status
- Manual check-in
- Driver tracking link
- Admin live map

Delivery status:

- `Prepared`
- `On Delivery`
- `Arrived`
- `Issue`

---

## 7. Driver GPS Tracking

Driver membuka route:

```text
/driver/tracking/:manifestId
```

Driver dapat memilih:

- **Start GPS Tracking** untuk GPS asli dari browser.
- **Start Demo Route** untuk simulator rute demo saat presentasi/hackathon.

GPS dikirim ke backend dan disimpan di `logistics_locations`.

---

## 8. Admin Live Map

Admin live map menampilkan:

- Latest GPS marker
- Route polyline
- History points
- Last updated
- GPS status

Signal status:

- `Waiting for GPS`
- `GPS Live`
- `Signal Stale`

Live map memakai polling setiap 5 detik.

---

## 9. Audit Logs

Audit log mencatat aktivitas penting:

- Production status update
- QC submission
- Logistics status update
- Delivery check-in
- Project CRUD
- Warehouse CRUD

---

## Environment Setup

Buat file `.env` dari contoh.

### Frontend

```bash
cp frontend/.env.example frontend/.env
```

Contoh isi:

```env
VITE_API_BASE_URL=http://localhost:3001
VITE_USE_BACKEND_API=true
```

### Backend

```bash
cp backend/.env.example backend/.env
```

Contoh isi:

```env
PORT=3001
DATABASE_URL=postgresql://postgres:password@127.0.0.1:5432/simo_system
DATABASE_URL_TEST=postgresql://postgres:password@127.0.0.1:5432/simo_system_test
JWT_SECRET=replace_with_long_random_secret
CORS_ORIGIN=http://localhost:5173
UPLOAD_DIR=server/public/uploads
```

> Jangan commit file `.env` asli. `DATABASE_URL`, `DATABASE_URL_TEST`, dan `JWT_SECRET` wajib diset; backend tidak memakai fallback credential atau fallback JWT secret.

---

## Install

Dari root project:

```bash
npm run install:all
```

Atau install manual:

```bash
npm install --prefix frontend
npm install --prefix backend
```

---

## Database Setup

1. Pastikan PostgreSQL berjalan.
2. Buat database, misalnya:

```sql
CREATE DATABASE simo_system;
CREATE DATABASE simo_system_test;
```

3. Set `DATABASE_URL` dan `DATABASE_URL_TEST` di `backend/.env`.
4. Jalankan seed demo:

```bash
npm run db:seed
```

Backend akan menginisialisasi schema dari:

```text
backend/server/db/schema.sql
```

---

## Run Development

Jalankan frontend dan backend bersamaan:

```bash
npm run dev:full
```

Atau terpisah:

```bash
npm run dev:frontend
npm run dev:backend
```

Default URL:

```text
Frontend       http://localhost:5173
Backend API    http://localhost:3001/api
Health Check   http://localhost:3001/api/health
Evidence API   http://localhost:3001/api/qc-checklists/evidence/<filename>
```

---

## Demo Login Accounts

Semua seeded user memakai password demo berikut. Backend menyimpan dan memverifikasi password sebagai hash `scrypt`, bukan plaintext:

```text
password
```

| Role | Email |
|---|---|
| Owner | `rina.wijaya@simo.test` |
| Production Manager | `budi.santoso@simo.test` |
| Foreman | `joko.anwar@simo.test` |
| QC Inspector | `siti.nurhaliza@simo.test` |
| Admin | `dewi.lestari@simo.test` |

---

## Demo Flow Recommended

Untuk presentasi cepat:

1. Login sebagai Admin.
2. Buka **Dashboard**.
3. Buka **Master Data** dan tunjukkan CRUD Project/Warehouse.
4. Buka **Warehouses** dan update status work item.
5. Buka **QC** dan submit checklist.
6. Buka **Logistics** dan pilih manifest.
7. Klik **Open Tracking Page**.
8. Di halaman driver klik **Start Demo Route**.
9. Kembali ke **Logistics**.
10. Tunggu ±5 detik hingga map menampilkan marker dan route.
11. Buka **Audit Logs** untuk menunjukkan trace aktivitas.

---

## Quality Checks

Command yang sudah dipakai untuk verifikasi:

```bash
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix backend run test
```

Expected result:

- Frontend lint pass
- Frontend build pass
- Backend tests pass

Catatan: Vite bisa menampilkan warning chunk size. Itu warning performa, bukan build failure.

---

## Available Scripts

Root scripts:

```bash
npm run dev:frontend
npm run dev:backend
npm run dev:full
npm run install:all
npm run build:frontend
npm run lint:frontend
npm run test:frontend
npm run test:backend
npm run db:seed
```

---

## Security Notes

- Commit `.env.example`, jangan commit `.env` asli.
- Gunakan `JWT_SECRET` kuat untuk production.
- Gunakan HTTPS untuk production, terutama untuk browser geolocation.
- Driver GPS browser membutuhkan permission location.
- Batasi CORS origin sesuai domain production.
- Evidence upload hanya menerima JPG, PNG, dan WEBP dengan validasi ekstensi, MIME type, dan magic bytes.
- Driver GPS tracking memakai manifest-specific tracking token pada URL driver.
- JWT masih disimpan di `localStorage` untuk kesederhanaan demo; production sebaiknya memakai HttpOnly Secure SameSite cookies.
- Jangan expose database credential di repository.

Cek env ignored:

```bash
git check-ignore -v backend/.env frontend/.env
```

---

## Known Limitations

- Live map masih polling, belum WebSocket/SSE.
- Geofencing belum tersedia.
- ETA calculation belum tersedia.
- Route deviation alert belum tersedia.
- User management UI belum lengkap.
- Migration system formal belum ditambahkan.
- Evidence file disajikan lewat route authenticated; production bisa memakai object storage private.
- Driver tracking link berisi token per manifest dan bisa di-regenerate dari halaman Logistics.
- JWT masih disimpan di `localStorage` untuk demo, bukan cookie HttpOnly production.
- Production deployment config belum final.

---

## Roadmap

### Phase 1 — Stabilization

- Hardening auth/session.
- Better error boundary.
- Database migration system.
- More automated tests.

### Phase 2 — Logistics Pro

- WebSocket/SSE realtime tracking.
- Geofencing alert.
- Route deviation alert.
- ETA and delay detection.
- Driver and vehicle master data.

### Phase 3 — Production Pro

- Work order CRUD.
- Material stock.
- BOM.
- Production scheduling.
- Warehouse transfer.

### Phase 4 — Business Intelligence

- KPI dashboard.
- Export PDF/Excel.
- Daily reports.
- Audit analytics.
- Delivery performance report.

---

## Current Status

SIMO Mugi Jaya saat ini sudah siap untuk **demo internal, hackathon, dan MVP client review**.

Untuk production live client, lanjutkan hardening pada:

- Security
- Deployment
- Backup strategy
- Migration
- Monitoring
- Full QA regression
