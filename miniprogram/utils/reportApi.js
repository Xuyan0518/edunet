const { request } = require('./api');
const { formatReportDateTime } = require('./reportDate');

const MANAGER_ROLES = new Set(['teacher', 'admin']);

const toString = (value) => (value == null ? '' : String(value));

const normalizeSummaryPreview = (value) => {
  const text = toString(value).trim();
  if (!text) return '';
  return text.length > 180 ? `${text.slice(0, 180)}...` : text;
};

const normalizeReportType = (value) => (value === 'yearly' ? 'yearly' : 'quarterly');

const normalizeReportStatus = (value) => (value === 'final' ? 'final' : 'draft');

const normalizeReportListItem = (item = {}) => ({
  id: item.id || '',
  studentId: item.studentId || '',
  reportType: normalizeReportType(item.reportType),
  title: item.title || '',
  startDate: item.startDate || '',
  endDate: item.endDate || '',
  year: typeof item.year === 'number' ? item.year : null,
  summary: toString(item.summary),
  summaryPreview: item.summaryPreview || normalizeSummaryPreview(item.summary),
  status: normalizeReportStatus(item.status),
  visibleToParent: !!item.visibleToParent,
  createdBy: item.createdBy || '',
  updatedBy: item.updatedBy || '',
  createdAt: item.createdAt || '',
  updatedAt: item.updatedAt || '',
  createdAtText: formatReportDateTime(item.createdAt),
  updatedAtText: formatReportDateTime(item.updatedAt),
  updatedByName: item.updatedByName || '',
});

const normalizeReportDetail = (item = {}) => ({
  ...normalizeReportListItem(item),
  analytics: item.analytics || null,
  structuredReport: item.structuredReport || null,
  finalReport: item.finalReport || null,
  rawAiResponse: item.rawAiResponse,
  parseError: item.parseError,
});

const buildQuery = (filters = {}) => {
  const params = [];
  if (filters.reportType) params.push(`reportType=${encodeURIComponent(filters.reportType)}`);
  if (filters.year != null && filters.year !== '') params.push(`year=${encodeURIComponent(filters.year)}`);
  if (filters.visibleToParent != null && filters.visibleToParent !== '') {
    params.push(`visibleToParent=${encodeURIComponent(filters.visibleToParent)}`);
  }
  return params.length ? `?${params.join('&')}` : '';
};

const generateQuarterlyReport = async (studentId, startDate, endDate, saveReport = true) =>
  request({
    url: '/ai/quarterly-summary',
    method: 'POST',
    data: {
      studentId,
      startDate,
      endDate,
      saveReport,
    },
  });

const generateYearlyReport = async (studentId, year, saveReport = true) =>
  request({
    url: '/ai/yearly-summary',
    method: 'POST',
    data: {
      studentId,
      year,
      saveReport,
    },
  });

const createReport = async (payload) => normalizeReportDetail(
  await request({
    url: '/reports',
    method: 'POST',
    data: payload,
  })
);

const listStudentReports = async (studentId, filters = {}) => {
  const data = await request({
    url: `/students/${studentId}/reports${buildQuery(filters)}`,
  });
  const list = Array.isArray(data) ? data : [];
  return list.map(normalizeReportListItem);
};

const getReport = async (reportId) =>
  normalizeReportDetail(
    await request({
      url: `/reports/${reportId}`,
    })
  );

const updateReport = async (reportId, payload) =>
  normalizeReportDetail(
    await request({
      url: `/reports/${reportId}`,
      method: 'PATCH',
      data: payload,
    })
  );

const updateReportVisibility = async (reportId, visibleToParent) =>
  normalizeReportListItem(
    await request({
      url: `/reports/${reportId}/visibility`,
      method: 'PATCH',
      data: { visibleToParent },
    })
  );

const deleteReport = async (reportId) =>
  request({
    url: `/reports/${reportId}`,
    method: 'DELETE',
  });

const resolveRoleFlags = (role) => ({
  isManager: MANAGER_ROLES.has(role),
  isParent: role === 'parent',
  isStudent: role === 'student',
});

module.exports = {
  MANAGER_ROLES,
  normalizeReportListItem,
  normalizeReportDetail,
  buildQuery,
  generateQuarterlyReport,
  generateYearlyReport,
  createReport,
  listStudentReports,
  getReport,
  updateReport,
  updateReportVisibility,
  deleteReport,
  resolveRoleFlags,
};
