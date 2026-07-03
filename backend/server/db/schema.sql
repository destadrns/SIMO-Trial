PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT ''
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  role_id TEXT NOT NULL REFERENCES roles(id),
  site TEXT NOT NULL DEFAULT '',
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client_name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  due_date TEXT,
  priority TEXT NOT NULL DEFAULT 'Medium',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS warehouses (
  id TEXT PRIMARY KEY,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'Active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS work_items (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  material_name TEXT NOT NULL,
  quantity REAL NOT NULL DEFAULT 0 CHECK (quantity >= 0),
  unit TEXT NOT NULL DEFAULT 'pcs',
  status TEXT NOT NULL CHECK (status IN ('To-Do', 'In-Progress', 'Done')),
  progress_weight REAL NOT NULL DEFAULT 1 CHECK (progress_weight >= 0),
  qc_status TEXT NOT NULL CHECK (qc_status IN ('Pending', 'Passed QC', 'Rework')),
  ready_to_ship INTEGER NOT NULL DEFAULT 0 CHECK (ready_to_ship IN (0, 1)),
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS qc_checklists (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  warehouse_id TEXT NOT NULL REFERENCES warehouses(id),
  work_item_id TEXT NOT NULL REFERENCES work_items(id),
  material_name TEXT NOT NULL,
  length REAL NOT NULL CHECK (length >= 0),
  width REAL NOT NULL CHECK (width >= 0),
  thickness REAL NOT NULL CHECK (thickness >= 0),
  qc_status TEXT NOT NULL CHECK (qc_status IN ('Pending', 'Passed QC', 'Rework')),
  notes TEXT NOT NULL DEFAULT '',
  evidence_photo_reference TEXT NOT NULL DEFAULT '',
  inspector_user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  inspector_name TEXT NOT NULL DEFAULT 'System',
  inspector_role TEXT NOT NULL DEFAULT 'System',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logistics_manifests (
  id TEXT PRIMARY KEY,
  manifest_number TEXT NOT NULL UNIQUE,
  tracking_token TEXT UNIQUE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  driver_name TEXT NOT NULL,
  driver_phone TEXT NOT NULL DEFAULT '',
  vehicle_plate TEXT NOT NULL,
  vehicle_type TEXT NOT NULL DEFAULT '',
  origin TEXT NOT NULL,
  destination TEXT NOT NULL,
  delivery_status TEXT NOT NULL CHECK (delivery_status IN ('Prepared', 'On Delivery', 'Arrived', 'Issue')),
  departure_time TEXT,
  arrival_time TEXT,
  notes TEXT NOT NULL DEFAULT '',
  created_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS delivery_checkins (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL REFERENCES logistics_manifests(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK (status IN ('Prepared', 'On Delivery', 'Arrived', 'Issue')),
  location_text TEXT NOT NULL,
  notes TEXT NOT NULL DEFAULT '',
  checked_in_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  checked_in_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS logistics_locations (
  id TEXT PRIMARY KEY,
  manifest_id TEXT NOT NULL REFERENCES logistics_manifests(id) ON DELETE CASCADE,
  latitude NUMERIC(10, 7) NOT NULL CHECK (latitude >= -90 AND latitude <= 90),
  longitude NUMERIC(10, 7) NOT NULL CHECK (longitude >= -180 AND longitude <= 180),
  accuracy REAL CHECK (accuracy IS NULL OR accuracy >= 0),
  speed REAL CHECK (speed IS NULL OR speed >= 0),
  heading REAL CHECK (heading IS NULL OR (heading >= 0 AND heading <= 360)),
  recorded_by TEXT REFERENCES users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'driver_geolocation',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  user_id TEXT REFERENCES users(id) ON DELETE SET NULL,
  user_name TEXT NOT NULL DEFAULT 'System',
  role_name TEXT NOT NULL DEFAULT 'System',
  module TEXT NOT NULL,
  action_type TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  table_name TEXT NOT NULL,
  previous_value TEXT,
  new_value TEXT,
  description TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_warehouses_project_id ON warehouses(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_project_id ON work_items(project_id);
CREATE INDEX IF NOT EXISTS idx_work_items_warehouse_id ON work_items(warehouse_id);
CREATE INDEX IF NOT EXISTS idx_qc_checklists_work_item_id ON qc_checklists(work_item_id);
CREATE INDEX IF NOT EXISTS idx_logistics_manifests_project_id ON logistics_manifests(project_id);
CREATE INDEX IF NOT EXISTS idx_logistics_manifests_status ON logistics_manifests(delivery_status);
CREATE INDEX IF NOT EXISTS idx_delivery_checkins_manifest_id ON delivery_checkins(manifest_id);
CREATE INDEX IF NOT EXISTS idx_logistics_locations_manifest_id ON logistics_locations(manifest_id);
CREATE INDEX IF NOT EXISTS idx_logistics_locations_created_at ON logistics_locations(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_module ON audit_logs(module);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);
