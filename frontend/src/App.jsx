import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Box,
  Truck,
  CheckSquare,
  FileText,
  BarChart3,
  Search,
  User,
  UserPlus,
  RefreshCw,
  LogOut,
  Database,
} from 'lucide-react';
import { AppDataProvider } from './context/AppDataContext';
import { useAppData } from './context/AppDataCore';
import { useBackendApi } from './services/apiClient';
import { getLogisticsManifests } from './services/logisticsApi';
import { StatusBadge } from './components/ui';
const Login = lazy(() => import('./pages/Login'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Logistics = lazy(() => import('./pages/Logistics'));
const DriverTracking = lazy(() => import('./pages/DriverTracking'));
const AuditLogs = lazy(() => import('./pages/AuditLogs'));
const Reports = lazy(() => import('./pages/Reports'));
const Warehouses = lazy(() => import('./pages/Warehouses'));
const QualityControl = lazy(() => import('./pages/QualityControl'));
const MasterData = lazy(() => import('./pages/MasterData'));
const UserManagement = lazy(() => import('./pages/UserManagement'));
const InviteAccept = lazy(() => import('./pages/InviteAccept'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));

const SidebarItem = ({ icon: Icon, label, path }) => (
  <NavLink
    to={path}
    end={path === '/'}
    className={({ isActive }) =>
      `flex flex-shrink-0 items-center gap-3 rounded-lg px-3.5 py-2.5 text-sm font-bold transition-colors lg:w-full ${
        isActive
          ? 'bg-blue-600 text-white shadow-sm shadow-blue-200'
          : 'text-slate-600 hover:bg-white hover:text-slate-950'
      }`
    }
  >
    {({ isActive }) => (
      <>
        <Icon size={19} className={isActive ? 'text-white' : 'text-slate-500'} />
        <span>{label}</span>
      </>
    )}
  </NavLink>
);


function resultMatches(values, query) {
  return values.some((value) => String(value || '').toLowerCase().includes(query));
}

const GlobalSearch = () => {
  const { data, users, permissions } = useAppData();
  const navigate = useNavigate();
  const rootRef = useRef(null);
  const [term, setTerm] = useState('');
  const [debouncedTerm, setDebouncedTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [manifests, setManifests] = useState([]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedTerm(term.trim().toLowerCase()), 300);
    return () => window.clearTimeout(timer);
  }, [term]);

  useEffect(() => {
    if (!permissions.canAccessLogistics) return;
    let active = true;
    getLogisticsManifests()
      .then((response) => { if (active) setManifests(response.data || []); })
      .catch(() => { if (active) setManifests([]); });
    return () => { active = false; };
  }, [permissions.canAccessLogistics]);

  useEffect(() => {
    const closeOnOutsideClick = (event) => {
      if (rootRef.current && !rootRef.current.contains(event.target)) setIsOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    return () => document.removeEventListener('mousedown', closeOnOutsideClick);
  }, []);

  const groups = useMemo(() => {
    const query = debouncedTerm;
    if (!query) return [];
    const limit = (items) => items.slice(0, 4);
    const nextGroups = [
      {
        label: 'Projects',
        items: limit(data.projects.filter((project) => resultMatches([project.code, project.name, project.clientName, project.client, project.location, project.status], query)).map((project) => ({ id: `project-${project.id}`, title: `${project.code} - ${project.name}`, subtitle: project.clientName || project.client || project.location, path: '/master-data' }))),
      },
      {
        label: 'Warehouses',
        items: limit(data.warehouses.filter((warehouse) => resultMatches([warehouse.code, warehouse.name, warehouse.location, warehouse.category, warehouse.status], query)).map((warehouse) => ({ id: `warehouse-${warehouse.id}`, title: `${warehouse.code} - ${warehouse.name}`, subtitle: warehouse.location || warehouse.category, path: '/master-data' }))),
      },
      {
        label: 'Work Items',
        items: permissions.canUpdateProduction ? limit(data.workItems.filter((item) => resultMatches([item.materialName, item.taskName, item.status, item.qcStatus], query)).map((item) => ({ id: `work-${item.id}`, title: item.materialName, subtitle: `${item.taskName} - ${item.status}`, path: '/warehouses' }))) : [],
      },
      {
        label: 'QC Checklists',
        items: permissions.canSubmitQc ? limit(data.qcChecklists.filter((record) => resultMatches([record.materialName, record.qcStatus, record.createdBy, record.notes], query)).map((record) => ({ id: `qc-${record.id}`, title: record.materialName, subtitle: `${record.qcStatus} - ${record.createdBy || 'Inspector'}`, path: '/qc' }))) : [],
      },
      {
        label: 'Logistics',
        items: permissions.canAccessLogistics ? limit(manifests.filter((manifest) => resultMatches([manifest.manifestNumber, manifest.projectName, manifest.driverName, manifest.deliveryStatus, manifest.origin, manifest.destination], query)).map((manifest) => ({ id: `logistics-${manifest.id}`, title: manifest.manifestNumber, subtitle: `${manifest.driverName} - ${manifest.deliveryStatus}`, path: '/logistics' }))) : [],
      },
      {
        label: 'Audit Logs',
        items: permissions.canViewAudit ? limit(data.auditLogs.filter((log) => resultMatches([log.user, log.role, log.action, log.entityType, log.entityId, log.description, log.timestamp, log.createdAt], query)).map((log) => ({ id: `audit-${log.id}`, title: log.action, subtitle: `${log.user || 'System'} - ${log.entityType || log.module || 'Audit'}`, path: '/audit' }))) : [],
      },
      {
        label: 'Users',
        items: permissions.canManageAccounts ? limit(users.filter((user) => resultMatches([user.name, user.email, user.roleName, user.accountStatus, user.site], query)).map((user) => ({ id: `user-${user.id}`, title: user.name, subtitle: `${user.email} - ${user.roleName}`, path: '/accounts' }))) : [],
      },
    ];
    return nextGroups.filter((group) => group.items.length > 0);
  }, [data, debouncedTerm, manifests, permissions, users]);

  const hasQuery = Boolean(debouncedTerm);
  const hasResults = groups.some((group) => group.items.length > 0);

  const openResult = (path) => {
    const query = encodeURIComponent(term.trim());
    navigate(`${path}${query ? `?search=${query}` : ''}`);
    setIsOpen(false);
  };

  return (
    <div ref={rootRef} className="relative w-full sm:max-w-md">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={18} />
        <input
          aria-label="Search workspace"
          type="search"
          value={term}
          onChange={(event) => { setTerm(event.target.value); setIsOpen(true); }}
          onFocus={() => setIsOpen(true)}
          onKeyDown={(event) => { if (event.key === 'Escape') setIsOpen(false); }}
          placeholder="Search projects, work items, audit logs..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-10 pr-4 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>
      {isOpen && hasQuery && (
        <div className="absolute left-0 right-0 top-full z-30 mt-2 max-h-[70vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-2 shadow-xl">
          {hasResults ? groups.map((group) => (
            <div key={group.label} className="py-1">
              <p className="px-2 pb-1 text-[11px] font-black uppercase tracking-wide text-slate-400">{group.label}</p>
              <div className="space-y-1">
                {group.items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => openResult(item.path)}
                    className="block w-full rounded-lg px-3 py-2 text-left transition-colors hover:bg-blue-50 focus:outline-none focus:ring-2 focus:ring-blue-200"
                  >
                    <span className="block truncate text-sm font-bold text-slate-800">{item.title}</span>
                    <span className="block truncate text-xs font-semibold text-slate-500">{item.subtitle}</span>
                  </button>
                ))}
              </div>
            </div>
          )) : (
            <p className="px-3 py-4 text-center text-sm font-semibold text-slate-500">No results found.</p>
          )}
        </div>
      )}
    </div>
  );
};

const UserSwitcher = () => {
  const { users, activeUser, activeUserId, setActiveUserId, resetDemoData, token, logout } = useAppData();
  const useApi = useBackendApi;

  if (useApi && token) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
        <div className="hidden h-9 w-9 items-center justify-center rounded-lg border border-blue-100 bg-blue-50 text-blue-700 sm:flex">
          <User size={17} />
        </div>
        <div className="min-w-0">
          <span className="block max-w-[150px] truncate text-sm font-bold text-slate-800" title={activeUser?.name}>
            {activeUser?.name}
          </span>
        </div>
        <StatusBadge tone="blue" className="max-w-[160px] truncate">
          {activeUser?.roleName}
        </StatusBadge>
        <button
          type="button"
          onClick={logout}
          className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 text-xs font-bold text-rose-700 shadow-sm transition-colors hover:bg-rose-100 focus:outline-none focus:ring-2 focus:ring-rose-200"
        >
          <LogOut size={14} />
          Logout
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <div className="hidden h-9 w-9 items-center justify-center rounded-lg bg-slate-100 text-slate-600 sm:flex">
        <User size={17} />
      </div>
      <div className="min-w-0">
        <select
          aria-label="Active user"
          value={activeUserId}
          onChange={(event) => setActiveUserId(event.target.value)}
          className="w-full max-w-[260px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-semibold text-slate-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name} - {user.roleName}
            </option>
          ))}
        </select>
      </div>
      <button
        type="button"
        onClick={resetDemoData}
        className="inline-flex h-9 flex-shrink-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-800"
      >
        <RefreshCw size={16} />
        Reset
      </button>
    </div>
  );
};

const Layout = ({ children }) => {
  const { permissions } = useAppData();

  return (
    <div className="min-h-screen bg-slate-100 font-sans text-slate-800 lg:flex">
      <aside className="border-b border-slate-200 bg-slate-50 lg:sticky lg:top-0 lg:min-h-screen lg:w-[264px] lg:flex-shrink-0 lg:border-b-0 lg:border-r">
        <div className="p-4 sm:p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-lg font-bold text-white">
              S
            </div>
            <div className="min-w-0">
              <span className="block truncate text-lg font-black text-slate-900">SIMO Mugi Jaya</span>
              <span className="block text-xs font-semibold text-slate-500">Operations Control</span>
            </div>
          </div>
        </div>

        <nav className="flex gap-2 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1.5">
          <SidebarItem icon={LayoutDashboard} label="Dashboard" path="/" />
          {permissions.canUpdateProduction && (
            <>
              <SidebarItem icon={Box} label="Warehouses" path="/warehouses" />
              <SidebarItem icon={Database} label="Master Data" path="/master-data" />
            </>
          )}
          {permissions.canAccessLogistics && (
            <SidebarItem icon={Truck} label="Logistics" path="/logistics" />
          )}
          {permissions.canSubmitQc && (
            <SidebarItem icon={CheckSquare} label="QC" path="/qc" />
          )}
          {permissions.canViewReports && (
            <SidebarItem icon={BarChart3} label="Reports" path="/reports" />
          )}
          {permissions.canViewAudit && (
            <SidebarItem icon={FileText} label="Audit Logs" path="/audit" />
          )}
          {permissions.canManageAccounts && (
            <SidebarItem icon={UserPlus} label="Accounts" path="/accounts" />
          )}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 border-b border-slate-200 bg-slate-50/90 px-4 py-3 backdrop-blur-sm sm:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
<GlobalSearch />

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
              <UserSwitcher />
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-4 sm:p-6 lg:p-8">
          <Suspense fallback={<div className="rounded-xl border border-slate-200 bg-white p-6 text-sm font-semibold text-slate-500 shadow-sm">Loading page...</div>}>
            <div className="mx-auto max-w-7xl space-y-6">{children}</div>
          </Suspense>
        </main>
      </div>
    </div>
  );
};

function ProtectedAppRoutes() {
  const { permissions } = useAppData();

  return (
    <Layout>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route
          path="/logistics"
          element={
            permissions.canAccessLogistics ? <Logistics /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/audit"
          element={
            permissions.canViewAudit ? <AuditLogs /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/reports"
          element={
            permissions.canViewReports ? <Reports /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/warehouses"
          element={
            permissions.canUpdateProduction ? <Warehouses /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/master-data"
          element={
            permissions.canUpdateProduction ? <MasterData /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/qc"
          element={
            permissions.canSubmitQc ? <QualityControl /> : <Navigate to="/" replace />
          }
        />
        <Route
          path="/accounts"
          element={
            permissions.canManageAccounts ? <UserManagement /> : <Navigate to="/" replace />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Layout>
  );
}

function AppRoutes() {
  const { token } = useAppData();
  const useApi = useBackendApi;

  return (
    <BrowserRouter>
      <Suspense fallback={<div className="min-h-screen bg-slate-100 p-6 text-sm font-semibold text-slate-500">Loading page...</div>}>
        <Routes>
          <Route path="/driver/tracking/:manifestId" element={<DriverTracking />} />
          <Route path="/accept-invite" element={<InviteAccept />} />
          <Route path="/forgot-password" element={<ForgotPassword />} />
          <Route path="/reset-password" element={<ResetPassword />} />
          <Route
            path="/login"
            element={useApi && token ? <Navigate to="/" replace /> : <Login />}
          />
          <Route
            path="/*"
            element={
              useApi && !token ? <Navigate to="/login" replace /> : <ProtectedAppRoutes />
            }
          />
        </Routes>
      </Suspense>
    </BrowserRouter>
  );
}

function App() {
  return (
    <AppDataProvider>
      <AppRoutes />
    </AppDataProvider>
  );
}

export default App;

