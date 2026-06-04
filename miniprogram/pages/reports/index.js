const { request } = require('../../utils/api');
const {
  listStudentReports,
  generateQuarterlyReport,
  generateYearlyReport,
  updateReport,
  updateReportVisibility,
  deleteReport,
  resolveRoleFlags,
} = require('../../utils/reportApi');
const { showActionLockToast } = require('../../utils/actionLock');
const { LIMITS, validateDateRange, validateYear } = require('../../utils/validation');

const buildYearOptions = () => {
  const currentYear = new Date().getFullYear();
  const values = ['全部年份'];
  for (let year = currentYear; year >= currentYear - 5; year -= 1) values.push(String(year));
  return values;
};

const pad = (value) => String(value).padStart(2, '0');

const todayString = () => {
  const now = new Date();
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
};

const quarterStart = () => {
  const now = new Date();
  const month = now.getMonth();
  const quarterMonth = Math.floor(month / 3) * 3;
  return `${now.getFullYear()}-${pad(quarterMonth + 1)}-01`;
};

const yearStart = (year) => `${year}-01-01`;
const yearEnd = (year) => `${year}-12-31`;

const buildPreviewReport = ({ reportType, studentId, studentName, startDate, endDate, year, response }) => ({
  id: '',
  studentId,
  reportType,
  title: reportType === 'yearly' ? `${year} 年度学习报告` : `${startDate} - ${endDate} 学期学习报告`,
  startDate: startDate || '',
  endDate: endDate || '',
  year: typeof year === 'number' ? year : null,
  summary: response?.summary || '',
  status: 'draft',
  visibleToParent: false,
  updatedByName: wx.getStorageSync('user')?.name || '',
  studentName: studentName || '',
  analytics: response?.analytics || null,
  structuredReport: response?.structuredReport || null,
  finalReport: response?.structuredReport || null,
  rawAiResponse: response?.rawAiResponse || '',
  parseError: response?.parseError || null,
});

Page({
  data: {
    student: {},
    studentId: '',
    reports: [],
    loading: true,
    generatingQuarterly: false,
    generatingYearly: false,
    refreshing: false,
    isManager: false,
    isParent: false,
    isStudent: false,
    reportTypeOptions: ['全部类型', '学期报告', '年度报告'],
    reportTypeIndex: 0,
    visibleFilterOptions: ['全部可见性', '仅已发布', '仅未发布'],
    visibleFilterIndex: 0,
    yearOptions: buildYearOptions(),
    yearIndex: 0,
    generateYearOptions: buildYearOptions().slice(1),
    generateYearIndex: 0,
    quarterlyStartDate: quarterStart(),
    quarterlyEndDate: todayString(),
    yearlyStartDate: yearStart(new Date().getFullYear()),
    yearlyEndDate: yearEnd(new Date().getFullYear()),
    parseWarning: '',
    hasLoaded: false,
    deletingId: '',
  },

  onLoad(query) {
    const studentId = query.studentId || query.id || '';
    if (!studentId) {
      wx.showToast({ title: '缺少学生信息', icon: 'none' });
      wx.navigateBack();
      return;
    }

    const role = wx.getStorageSync('user')?.role || '';
    const flags = resolveRoleFlags(role);

    this.studentId = studentId;
    this.setData({
      studentId,
      ...flags,
      yearOptions: buildYearOptions(),
      yearIndex: 0,
      generateYearOptions: buildYearOptions().slice(1),
      generateYearIndex: 0,
    });

    this.fetchAll();
  },

  onShow() {
    if (!this.data.hasLoaded) return;
    if (!this.studentId) return;
    this.fetchReports();
  },

  onPullDownRefresh() {
    this.fetchAll(true).finally(() => wx.stopPullDownRefresh());
  },

  fetchAll(isRefresh = false) {
    if (isRefresh) this.setData({ refreshing: true });
    else this.setData({ loading: true });

    return Promise.all([this.fetchStudent(), this.fetchReports()]).finally(() =>
      this.setData({ loading: false, refreshing: false, hasLoaded: true })
    );
  },

  fetchStudent() {
    return request({ url: `/students/${this.studentId}` })
      .then((student) => this.setData({ student: student || {} }))
      .catch(() => {
        wx.showToast({ title: '获取学生失败', icon: 'none' });
      });
  },

  buildFilters() {
    const filters = {};
    const type = this.data.reportTypeOptions[this.data.reportTypeIndex];
    if (type === '学期报告') filters.reportType = 'quarterly';
    if (type === '年度报告') filters.reportType = 'yearly';

    const yearText = this.data.yearOptions[this.data.yearIndex] || '全部年份';
    if (yearText !== '全部年份') filters.year = Number(yearText);

    if (this.data.isManager) {
      if (this.data.visibleFilterIndex === 1) filters.visibleToParent = true;
      if (this.data.visibleFilterIndex === 2) filters.visibleToParent = false;
    }

    return filters;
  },

  fetchReports() {
    return listStudentReports(this.studentId, this.buildFilters())
      .then((reports) => {
        const list = reports || [];
        this.setData({ reports: list });
        if (this.data.isParent && list.length) {
          const latest = list[0]?.updatedAt || list[0]?.createdAt || list[0]?.endDate || '';
          if (latest) {
            wx.setStorageSync(`reports_seen_${this.studentId}`, latest);
          }
        }
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || err?.error || '获取报告失败', icon: 'none' });
      });
  },

  onReportTypeChange(e) {
    this.setData({ reportTypeIndex: Number(e.detail.value) }, () => this.fetchReports());
  },

  onVisibleFilterChange(e) {
    this.setData({ visibleFilterIndex: Number(e.detail.value) }, () => this.fetchReports());
  },

  onYearFilterChange(e) {
    this.setData({ yearIndex: Number(e.detail.value) }, () => this.fetchReports());
  },

  onGenerateYearChange(e) {
    const generateYearIndex = Number(e.detail.value || 0);
    const yearText =
      this.data.generateYearOptions[generateYearIndex] || String(new Date().getFullYear());
    this.setData({
      generateYearIndex,
      yearlyStartDate: yearStart(yearText),
      yearlyEndDate: yearEnd(yearText),
    });
  },

  onQuarterStartChange(e) {
    this.setData({ quarterlyStartDate: e.detail.value });
  },

  onQuarterEndChange(e) {
    this.setData({ quarterlyEndDate: e.detail.value });
  },

  onYearlyStartChange(e) {
    this.setData({ yearlyStartDate: e.detail.value });
  },

  onYearlyEndChange(e) {
    this.setData({ yearlyEndDate: e.detail.value });
  },

  async generateQuarterly() {
    if (!this.data.isManager) return;

    const startDate = this.data.quarterlyStartDate;
    const endDate = this.data.quarterlyEndDate;
    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择日期范围', icon: 'none' });
      return;
    }
    if (startDate > endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate,
      endDate,
      maxDays: LIMITS.quarterlyRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: 'none' });
      return;
    }

    this.setData({ generatingQuarterly: true, parseWarning: '' });
    try {
      const response = await generateQuarterlyReport(this.studentId, startDate, endDate, true);
      if (response?.parseError) {
        this.setData({ parseWarning: 'AI 返回格式存在问题，已使用文本 fallback。' });
      }

      const reportId = response?.reportId || response?.savedReport?.id;
      if (reportId) {
        wx.showToast({ title: '报告已生成', icon: 'success' });
        wx.navigateTo({ url: `/pages/report-detail/index?reportId=${encodeURIComponent(reportId)}` });
        return;
      }

      const previewReport = buildPreviewReport({
        reportType: 'quarterly',
        studentId: this.studentId,
        studentName: this.data.student?.name || '',
        startDate,
        endDate,
        response,
      });
      wx.setStorageSync('report_preview_payload', previewReport);
      wx.showModal({
        title: '已生成预览',
        content: '报告已生成，但未返回 reportId。你可以先预览并手动保存草稿。',
        showCancel: false,
      });
      wx.navigateTo({ url: '/pages/report-detail/index?preview=1' });
    } catch (err) {
      if (showActionLockToast(err)) return;
      const message = err?.error === 'AI_NOT_CONFIGURED' ? 'AI 未配置' : '生成失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ generatingQuarterly: false });
      this.fetchReports();
    }
  },

  async generateYearly() {
    if (!this.data.isManager) return;

    const yearText =
      this.data.generateYearOptions[this.data.generateYearIndex] || String(new Date().getFullYear());
    const year = Number(yearText);
    const yearCheck = validateYear(year);
    if (!yearCheck.ok) {
      wx.showToast({ title: '请选择年份', icon: 'none' });
      return;
    }
    const startDate = this.data.yearlyStartDate || yearStart(yearCheck.year);
    const endDate = this.data.yearlyEndDate || yearEnd(yearCheck.year);
    if (!startDate || !endDate) {
      wx.showToast({ title: '请选择日期范围', icon: 'none' });
      return;
    }
    if (startDate > endDate) {
      wx.showToast({ title: '开始日期不能晚于结束日期', icon: 'none' });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate,
      endDate,
      maxDays: LIMITS.yearlyRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: 'none' });
      return;
    }

    this.setData({ generatingYearly: true, parseWarning: '' });
    try {
      const response = await generateYearlyReport(this.studentId, yearCheck.year, true, {
        startDate,
        endDate,
      });
      if (response?.parseError) {
        this.setData({ parseWarning: 'AI 返回格式存在问题，已使用文本 fallback。' });
      }

      const reportId = response?.reportId || response?.savedReport?.id;
      if (reportId) {
        wx.showToast({ title: '报告已生成', icon: 'success' });
        wx.navigateTo({ url: `/pages/report-detail/index?reportId=${encodeURIComponent(reportId)}` });
        return;
      }

      const previewReport = buildPreviewReport({
        reportType: 'yearly',
        studentId: this.studentId,
        studentName: this.data.student?.name || '',
        startDate,
        endDate,
        year: yearCheck.year,
        response,
      });
      wx.setStorageSync('report_preview_payload', previewReport);
      wx.showModal({
        title: '已生成预览',
        content: '报告已生成，但未返回 reportId。你可以先预览并手动保存草稿。',
        showCancel: false,
      });
      wx.navigateTo({ url: '/pages/report-detail/index?preview=1' });
    } catch (err) {
      if (showActionLockToast(err)) return;
      const message = err?.error === 'AI_NOT_CONFIGURED' ? 'AI 未配置' : '生成失败';
      wx.showToast({ title: message, icon: 'none' });
    } finally {
      this.setData({ generatingYearly: false });
      this.fetchReports();
    }
  },

  openReport(e) {
    const reportId = e?.currentTarget?.dataset?.id;
    if (!reportId) return;
    wx.navigateTo({ url: `/pages/report-detail/index?reportId=${encodeURIComponent(reportId)}` });
  },

  async toggleVisibility(e) {
    if (!this.data.isManager) return;

    const reportId = e?.currentTarget?.dataset?.id;
    const visible = e?.currentTarget?.dataset?.visible === true || e?.currentTarget?.dataset?.visible === 'true';
    if (!reportId) return;

    try {
      wx.showLoading({ title: visible ? '取消发布中...' : '发布中...' });
      if (!visible) {
        await updateReport(reportId, { status: 'final' });
        await updateReportVisibility(reportId, true);
      } else {
        await updateReportVisibility(reportId, false);
      }
      wx.showToast({ title: visible ? '已取消发布' : '已发布给家长', icon: 'success' });
      this.fetchReports();
    } catch (err) {
      if (showActionLockToast(err)) return;
      wx.showToast({ title: err?.message || err?.error || '操作失败', icon: 'none' });
    } finally {
      wx.hideLoading();
    }
  },

  async deleteReportItem(e) {
    if (!this.data.isManager) return;
    const reportId = e?.currentTarget?.dataset?.id;
    if (!reportId) return;
    wx.showModal({
      title: '确认删除',
      content: '删除后将进入该学生的回收站，可在 30 天内恢复。',
      confirmColor: '#dc2626',
      success: async (result) => {
        if (!result.confirm) return;
        this.setData({ deletingId: reportId });
        try {
          await deleteReport(reportId);
          wx.showToast({ title: '已删除', icon: 'success' });
          await this.fetchReports();
        } catch (err) {
          if (showActionLockToast(err)) return;
          wx.showToast({ title: err?.message || err?.error || '删除失败', icon: 'none' });
        } finally {
          this.setData({ deletingId: '' });
        }
      },
    });
  },
});
