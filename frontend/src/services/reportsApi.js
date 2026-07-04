import { apiRequest, apiTextRequest } from './apiClient';

function reportQuery(startDate, endDate) {
  return `startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
}

export function getReportTypes() {
  return apiRequest('/reports/types');
}

export function previewReport(type, { startDate, endDate }) {
  return apiRequest(`/reports/${encodeURIComponent(type)}/preview?${reportQuery(startDate, endDate)}`);
}

export function exportReportCsv(type, { startDate, endDate }) {
  return apiTextRequest(`/reports/${encodeURIComponent(type)}/export.csv?${reportQuery(startDate, endDate)}`);
}
