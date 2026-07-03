import { useCallback, useEffect, useMemo, useState } from 'react';
import { createInitialDemoState } from '../data/seedData';
import { AppDataContext } from './AppDataCore';

import { useBackendApi, apiRequest } from '../services/apiClient';
import { getWorkItems, updateWorkItemStatus as updateWorkItemStatusApi } from '../services/workItemsApi';
import { getQcChecklists, submitQcChecklist as submitQcChecklistApi } from '../services/qcApi';
import { getAuditLogs } from '../services/auditLogsApi';

const STORAGE_KEY = 'simo-mugi-jaya-demo-state';
const ACTIVE_USER_KEY = 'simo-mugi-jaya-active-user';
const TOKEN_KEY = 'simo-mugi-jaya-token';

function timestampNow() {
  return new Date().toLocaleString('sv-SE', { hour12: false });
}

function loadDemoState() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : createInitialDemoState();
  } catch {
    return createInitialDemoState();
  }
}

function decodeJwt(token) {
  try {
    const base64Url = token.split('.')[1];
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const jsonPayload = decodeURIComponent(
      window.atob(base64)
        .split('')
        .map((c) => '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2))
        .join('')
    );
    return JSON.parse(jsonPayload);
  } catch {
    return null;
  }
}

function buildAuditLog(activeUser, details) {
  return {
    id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    timestamp: timestampNow(),
    user: activeUser?.name || 'System',
    role: activeUser?.roleName || 'System',
    ...details,
  };
}

export function AppDataProvider({ children }) {
  const [data, setData] = useState(loadDemoState);
  const [isOffline, setIsOffline] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [token, setToken] = useState(() => {
    try {
      return window.localStorage.getItem(TOKEN_KEY) || null;
    } catch {
      return null;
    }
  });

  const [activeUserId, setActiveUserId] = useState(() => {
    try {
      return window.localStorage.getItem(ACTIVE_USER_KEY) || 'usr-owner';
    } catch {
      return 'usr-owner';
    }
  });

  const decodedUser = useMemo(() => {
    if (!token) return null;
    return decodeJwt(token);
  }, [token]);

  const rolesById = useMemo(
    () => new Map(data.roles.map((role) => [role.id, role])),
    [data.roles],
  );

  const users = useMemo(
    () =>
      data.users.map((user) => ({
        ...user,
        roleName: rolesById.get(user.roleId)?.name || user.roleId,
      })),
    [data.users, rolesById],
  );

  const activeUser = useMemo(() => {
    if (useBackendApi && decodedUser) {
      return {
        id: decodedUser.id,
        name: decodedUser.name,
        email: decodedUser.email,
        roleId: decodedUser.roleId,
        roleName: decodedUser.roleName,
        site: 'HQ / Cloud',
      };
    }
    return users.find((user) => user.id === activeUserId) || users[0];
  }, [activeUserId, users, decodedUser]);

  const activeUserIdResolved = useMemo(() => {
    return activeUser?.id || activeUserId;
  }, [activeUser, activeUserId]);

  const permissions = useMemo(() => {
    const roleId = activeUser?.roleId;

    return {
      canUpdateProduction: ['foreman', 'production-manager', 'admin'].includes(roleId),
      canSubmitQc: ['qc-inspector', 'admin'].includes(roleId),
      canViewAudit: ['owner', 'production-manager', 'admin', 'super-admin'].includes(roleId),
      canAccessLogistics: ['owner', 'production-manager', 'admin'].includes(roleId),
      canManageAccounts: roleId === 'super-admin',
    };
  }, [activeUser]);

  const projectsById = useMemo(
    () => new Map(data.projects.map((project) => [project.id, project])),
    [data.projects],
  );

  const warehousesById = useMemo(
    () => new Map(data.warehouses.map((warehouse) => [warehouse.id, warehouse])),
    [data.warehouses],
  );

  const metrics = useMemo(() => {
    const totalWorkItems = data.workItems.length;
    const completedWorkItems = data.workItems.filter((item) => item.status === 'Done').length;
    const readyToShipItems = data.workItems.filter((item) => item.readyToShip).length;
    const pendingQcItems = data.workItems.filter(
      (item) => item.status === 'Done' && item.qcStatus !== 'Passed QC',
    ).length;
    const progressPercentage = totalWorkItems
      ? Math.round((completedWorkItems / totalWorkItems) * 100)
      : 0;

    const projectProgress = data.projects.map((project) => {
      const items = data.workItems.filter((item) => item.projectId === project.id);
      const completed = items.filter((item) => item.status === 'Done').length;

      return {
        ...project,
        totalWorkItems: items.length,
        completedWorkItems: completed,
        progressPercentage: items.length ? Math.round((completed / items.length) * 100) : 0,
      };
    });

    const warehouseProgress = data.warehouses.map((warehouse) => {
      const items = data.workItems.filter((item) => item.warehouseId === warehouse.id);
      const completed = items.filter((item) => item.status === 'Done').length;
      const projectCodes = [
        ...new Set(items.map((item) => projectsById.get(item.projectId)?.code).filter(Boolean)),
      ];

      return {
        ...warehouse,
        projectCodes,
        totalWorkItems: items.length,
        completedWorkItems: completed,
        progressPercentage: items.length ? Math.round((completed / items.length) * 100) : 0,
      };
    });

    return {
      totalProjects: data.projects.length,
      totalWarehouses: data.warehouses.length,
      totalWorkItems,
      completedWorkItems,
      readyToShipItems,
      pendingQcItems,
      progressPercentage,
      projectProgress,
      warehouseProgress,
    };
  }, [data.projects, data.warehouses, data.workItems, projectsById]);

  const fetchData = useCallback(async (customToken = token) => {
    if (!useBackendApi) return;
    if (useBackendApi && !customToken) return;

    setIsLoading(true);
    try {
      const requestToken = customToken || token;
      const requestUser = requestToken ? decodeJwt(requestToken) : null;
      const roleId = requestUser?.roleId;
      const headers = customToken ? { Authorization: `Bearer ${customToken}` } : {};
      const canReadUsers = ['admin', 'owner', 'super-admin'].includes(roleId);
      const canReadAuditLogs = ['admin', 'owner', 'production-manager', 'super-admin'].includes(roleId);
      const canReadQcChecklists = ['admin', 'owner', 'production-manager', 'qc-inspector'].includes(roleId);
      const [
        rolesRes,
        usersRes,
        projectsRes,
        warehousesRes,
        workItemsRes,
        qcChecklistsRes,
        auditLogsRes
      ] = await Promise.all([
        apiRequest('/roles', { headers }),
        canReadUsers ? apiRequest('/users', { headers }) : Promise.resolve(null),
        apiRequest('/projects', { headers }),
        apiRequest('/warehouses', { headers }),
        getWorkItems(),
        canReadQcChecklists ? getQcChecklists() : Promise.resolve(null),
        canReadAuditLogs ? getAuditLogs() : Promise.resolve(null)
      ]);

      setData((current) => ({
        roles: rolesRes.data,
        users: usersRes?.data || current.users,
        projects: projectsRes.data,
        warehouses: warehousesRes.data,
        workItems: workItemsRes.data,
        qcChecklists: qcChecklistsRes?.data || current.qcChecklists,
        auditLogs: auditLogsRes?.data || current.auditLogs,
      }));
      setIsOffline(false);
    } catch (err) {
      console.error("API error, falling back to localStorage:", err);
      setIsOffline(true);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Load from backend on mount if enabled
  useEffect(() => {
    if (useBackendApi && token) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      fetchData();
    }
  }, [token, fetchData]);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }, [data]);

  useEffect(() => {
    window.localStorage.setItem(ACTIVE_USER_KEY, activeUserId);
  }, [activeUserId]);

  const login = useCallback(async (email, password) => {
    try {
      const res = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      const { token: receivedToken, user } = res.data;
      window.localStorage.setItem(TOKEN_KEY, receivedToken);
      setToken(receivedToken);
      setIsOffline(false);
      
      await fetchData(receivedToken);
      return user;
    } catch (err) {
      console.error("Login failed:", err);
      throw err;
    }
  }, [fetchData]);

  const logout = useCallback(() => {
    window.localStorage.removeItem(TOKEN_KEY);
    setToken(null);
  }, []);

  const updateWorkItemStatus = useCallback(
    async (workItemId, nextStatus) => {
      if (useBackendApi && !isOffline && token) {
        try {
          await updateWorkItemStatusApi(workItemId, nextStatus, activeUserIdResolved);
          
          const [workItemsRes, auditLogsRes] = await Promise.all([
            getWorkItems(),
            getAuditLogs()
          ]);

          setData((current) => ({
            ...current,
            workItems: workItemsRes.data,
            auditLogs: auditLogsRes.data,
          }));
          return;
        } catch (err) {
          console.error("Failed to update work item on server, falling back:", err);
          setIsOffline(true);
        }
      }

      // LocalStorage Fallback
      setData((currentData) => {
        const workItem = currentData.workItems.find((item) => item.id === workItemId);

        if (!workItem || workItem.status === nextStatus) {
          return currentData;
        }

        const updatedWorkItems = currentData.workItems.map((item) =>
          item.id === workItemId ? { ...item, status: nextStatus } : item,
        );

        const auditLog = buildAuditLog(activeUser, {
          action: 'UPDATE',
          table: 'work_items',
          recordId: workItem.id,
          previousValue: workItem.status,
          newValue: nextStatus,
          description: `Updated ${workItem.materialName} from ${workItem.status} to ${nextStatus}.`,
        });

        return {
          ...currentData,
          workItems: updatedWorkItems,
          auditLogs: [auditLog, ...currentData.auditLogs],
        };
      });
    },
    [activeUser, activeUserIdResolved, isOffline, token],
  );

  const submitQcChecklist = useCallback(
    async (payload) => {
      if (useBackendApi && !isOffline && token) {
        try {
          let body;
          if (payload.file) {
            body = new FormData();
            body.append('workItemId', payload.workItemId);
            body.append('materialName', payload.materialName);
            body.append('notes', payload.notes);
            body.append('length', payload.length);
            body.append('width', payload.width);
            body.append('thickness', payload.thickness);
            body.append('qcStatus', payload.qcStatus);
            body.append('evidencePhoto', payload.file);
            body.append('userId', activeUserIdResolved);
          } else {
            body = {
              ...payload,
              userId: activeUserIdResolved,
            };
          }

          await submitQcChecklistApi(body);

          const [workItemsRes, qcChecklistsRes, auditLogsRes] = await Promise.all([
            getWorkItems(),
            getQcChecklists(),
            getAuditLogs()
          ]);

          setData((current) => ({
            ...current,
            workItems: workItemsRes.data,
            qcChecklists: qcChecklistsRes.data,
            auditLogs: auditLogsRes.data,
          }));
          return;
        } catch (err) {
          console.error("Failed to submit QC on server, falling back:", err);
          setIsOffline(true);
        }
      }

      // LocalStorage Fallback
      setData((currentData) => {
        const workItem = currentData.workItems.find((item) => item.id === payload.workItemId);
        const checklist = {
          id: `qc-${Date.now()}`,
          ...payload,
          length: Number(payload.length) || 0,
          width: Number(payload.width) || 0,
          thickness: Number(payload.thickness) || 0,
          createdBy: activeUser?.name || 'System',
          createdByRole: activeUser?.roleName || 'System',
          createdAt: timestampNow(),
        };

        const updatedWorkItems = currentData.workItems.map((item) =>
          item.id === payload.workItemId
            ? {
                ...item,
                qcStatus: payload.qcStatus,
                readyToShip: payload.qcStatus === 'Passed QC',
              }
            : item,
        );

        const auditLog = buildAuditLog(activeUser, {
          action: 'INSERT',
          table: 'qc_checklists',
          recordId: checklist.id,
          previousValue: workItem?.qcStatus || '-',
          newValue: payload.qcStatus,
          description: `Submitted QC checklist for ${payload.materialName}.`,
        });

        return {
          ...currentData,
          workItems: updatedWorkItems,
          qcChecklists: [checklist, ...currentData.qcChecklists],
          auditLogs: [auditLog, ...currentData.auditLogs],
        };
      });
    },
    [activeUser, activeUserIdResolved, isOffline, token],
  );

  const resetDemoData = useCallback(() => {
    setData(createInitialDemoState());
    setActiveUserId('usr-owner');
  }, []);

  const value = useMemo(
    () => ({
      data,
      users,
      activeUser,
      activeUserId: activeUserIdResolved,
      setActiveUserId,
      permissions,
      projectsById,
      warehousesById,
      metrics,
      updateWorkItemStatus,
      submitQcChecklist,
      resetDemoData,
      isOffline,
      isLoading,
      token,
      login,
      logout,
    }),
    [
      data,
      users,
      activeUser,
      activeUserIdResolved,
      permissions,
      projectsById,
      warehousesById,
      metrics,
      updateWorkItemStatus,
      submitQcChecklist,
      resetDemoData,
      isOffline,
      isLoading,
      token,
      login,
      logout,
    ],
  );

  return <AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>;
}


