export function serializeRole(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
  };
}

export function serializeUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    roleId: row.role_id,
    roleName: row.role_name,
    site: row.site,
    isActive: Boolean(row.is_active),
    accountStatus: row.account_status,
    invitedBy: row.invited_by,
    invitedAt: row.invited_at,
    activatedAt: row.activated_at,
    passwordChangedAt: row.password_changed_at,
    disabledAt: row.disabled_at,
    lastActivityAt: row.last_activity_at || row.password_changed_at || row.invited_at || row.activated_at || row.disabled_at || row.created_at,
    createdAt: row.created_at,
  };
}

export function serializeProject(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    client: row.client_name,
    clientName: row.client_name,
    location: row.location,
    status: row.status,
    dueDate: row.due_date,
    priority: row.priority,
    createdAt: row.created_at,
  };
}

export function serializeWarehouse(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    code: row.code,
    name: row.name,
    location: row.location,
    category: row.category,
    status: row.status,
    createdAt: row.created_at,
  };
}

export function serializeWorkItem(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    warehouseId: row.warehouse_id,
    taskName: row.name,
    name: row.name,
    category: row.category,
    materialName: row.material_name,
    quantity: row.quantity,
    unit: row.unit,
    status: row.status,
    progressWeight: row.progress_weight,
    qcStatus: row.qc_status,
    readyToShip: Boolean(row.ready_to_ship),
    updatedAt: row.updated_at,
  };
}

export function serializeQcChecklist(row) {
  return {
    id: row.id,
    projectId: row.project_id,
    warehouseId: row.warehouse_id,
    workItemId: row.work_item_id,
    materialName: row.material_name,
    length: row.length,
    width: row.width,
    thickness: row.thickness,
    qcStatus: row.qc_status,
    notes: row.notes,
    evidencePhoto: row.evidence_photo_reference,
    evidencePhotoReference: row.evidence_photo_reference,
    inspectorUserId: row.inspector_user_id,
    createdBy: row.inspector_name,
    createdByRole: row.inspector_role,
    createdAt: row.created_at,
  };
}

export function serializeDeliveryCheckin(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    manifestId: row.manifest_id,
    status: row.status,
    locationText: row.location_text,
    notes: row.notes,
    checkedInBy: row.checked_in_by,
    checkedInByName: row.checked_in_by_name,
    checkedInAt: row.checked_in_at,
  };
}

function nullableNumber(value) {
  return value === null || value === undefined ? null : Number(value);
}

export function serializeLogisticsLocation(row) {
  if (!row) {
    return null;
  }

  return {
    id: row.id,
    manifestId: row.manifest_id,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    accuracy: nullableNumber(row.accuracy),
    speed: nullableNumber(row.speed),
    heading: nullableNumber(row.heading),
    recordedBy: row.recorded_by,
    recordedByName: row.recorded_by_name,
    source: row.source,
    createdAt: row.created_at,
  };
}

export function serializeLogisticsManifest(row) {
  return {
    id: row.id,
    manifestNumber: row.manifest_number,
    trackingToken: row.tracking_token,
    projectId: row.project_id,
    projectName: row.project_name,
    projectCode: row.project_code,
    driverName: row.driver_name,
    driverPhone: row.driver_phone,
    vehiclePlate: row.vehicle_plate,
    vehicleType: row.vehicle_type,
    origin: row.origin,
    destination: row.destination,
    deliveryStatus: row.delivery_status,
    departureTime: row.departure_time,
    arrivalTime: row.arrival_time,
    notes: row.notes,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    latestCheckin: serializeDeliveryCheckin({
      id: row.latest_checkin_id,
      manifest_id: row.id,
      status: row.latest_checkin_status,
      location_text: row.latest_checkin_location,
      notes: row.latest_checkin_notes,
      checked_in_by: row.latest_checkin_by,
      checked_in_by_name: row.latest_checkin_by_name,
      checked_in_at: row.latest_checkin_at,
    }),
  };
}

export function serializeAuditLog(row) {
  return {
    id: row.id,
    userId: row.user_id,
    user: row.user_name,
    userName: row.user_name,
    role: row.role_name,
    roleName: row.role_name,
    module: row.module,
    actionType: row.action_type,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    table: row.table_name,
    recordId: row.entity_id,
    previousValue: row.previous_value,
    newValue: row.new_value,
    description: row.description,
    timestamp: row.created_at,
    createdAt: row.created_at,
  };
}
