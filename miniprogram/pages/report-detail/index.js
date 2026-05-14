const {
  getReport,
  updateReport,
  updateReportVisibility,
  createReport,
  resolveRoleFlags,
} = require('../../utils/reportApi');
const { buildReportMarkdown } = require('../../utils/reportMarkdown');
const {
  ensureArray,
  resolveDisplayReport,
  resolveDisplaySummary,
  resolveReportType,
  normalizeSubjectReports,
  buildEditableForm,
  buildFinalReportPayload,
  buildSummaryFromStructured,
} = require('../../utils/reportViewModel');

const scoreSourceMap = {
  paper: '试卷',
  exam: '考试',
};

const percentageText = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return `${Number(value).toFixed(1)}%`;
};

const toPercent = (value) => {
  if (value == null || Number.isNaN(Number(value))) return '--';
  return `${Number(value)}%`;
};

const intensityClass = {
  none: 'bar-none',
  low: 'bar-low',
  medium: 'bar-medium',
  high: 'bar-high',
};

const clone = (value) => JSON.parse(JSON.stringify(value));

Page({
  data: {
    reportId: '',
    report: null,
    loading: true,
    saving: false,
    publishing: false,
    previewMode: false,
    isManager: false,
    isParent: false,
    isStudent: false,
    reportType: 'quarterly',
    displayReport: null,
    summaryText: '',
    subjectReports: [],
    analytics: null,
    overviewCards: [],
    strongestSubjectsText: '--',
    improvingSubjectsText: '--',
    attentionSubjectsText: '--',
    dailyActivityRows: [],
    weeklyActivityRows: [],
    subjectDistributionRows: [],
    scoreTrendSubjects: [],
    selectedTrendIndex: 0,
    currentTrendPoints: [],
    editMode: false,
    editForm: null,
  },

  onLoad(query) {
    const role = wx.getStorageSync('user')?.role || '';
    const flags = resolveRoleFlags(role);
    this.setData({ ...flags });

    const previewMode = query.preview === '1';
    if (previewMode) {
      this.loadPreview();
      return;
    }

    const reportId = query.reportId || '';
    if (!reportId) {
      wx.showToast({ title: '缺少报告ID', icon: 'none' });
      wx.navigateBack();
      return;
    }

    this.reportId = reportId;
    this.setData({ reportId });
    this.fetchReport();
  },

  loadPreview() {
    const preview = wx.getStorageSync('report_preview_payload') || null;
    if (!preview) {
      wx.showToast({ title: '预览已失效', icon: 'none' });
      wx.navigateBack();
      return;
    }

    this.setData({ previewMode: true, loading: false });
    this.applyReport(preview);
  },

  fetchReport() {
    this.setData({ loading: true });
    getReport(this.reportId)
      .then((report) => {
        this.applyReport(report);
      })
      .catch((err) => {
        wx.showToast({ title: err?.error || '获取报告失败', icon: 'none' });
      })
      .finally(() => this.setData({ loading: false }));
  },

  applyReport(report) {
    const safeReport = report || {};
    const reportType = resolveReportType(safeReport);
    const displayReport = resolveDisplayReport(safeReport);
    const summaryText = displayReport
      ? buildSummaryFromStructured(reportType, displayReport, safeReport.summary)
      : resolveDisplaySummary(safeReport);
    const subjectReports = normalizeSubjectReports(reportType, displayReport || {});
    const analytics = safeReport.analytics || null;
    const overview = analytics?.overview || {};

    const overviewCards = [
      { label: '活跃天数', value: overview.activeDays ?? '--' },
      { label: '活跃率', value: toPercent(overview.activeRate) },
      { label: '科目数', value: overview.totalSubjects ?? '--' },
      { label: '试卷数', value: overview.totalPapers ?? '--' },
      { label: '考试数', value: overview.totalExams ?? '--' },
    ];

    const dailyActivity = ensureArray(analytics?.learningActivity?.dailyActivity);
    const maxDailyActivity = Math.max(
      1,
      ...dailyActivity.map((item) => Number(item?.activityCount || 0))
    );
    const dailyActivityRows = dailyActivity
      .slice(-21)
      .map((row) => {
        const activityCount = Number(row?.activityCount || 0);
        const width = Math.max(6, Math.round((activityCount / maxDailyActivity) * 100));
        const intensity = row?.intensity || 'none';
        return {
          date: row?.date || '',
          activityCount,
          subjectCount: Number(row?.subjectCount || 0),
          subjectsText: ensureArray(row?.subjects).slice(0, 4).join('、'),
          widthStyle: `width: ${width}%;`,
          intensityClass: intensityClass[intensity] || 'bar-none',
        };
      });

    const weeklyActivityRows = ensureArray(analytics?.learningActivity?.weeklyActivity).map((row) => ({
      weekText: `${row?.weekStart || '--'} ~ ${row?.weekEnd || '--'}`,
      activeDays: Number(row?.activeDays || 0),
      activityCount: Number(row?.activityCount || 0),
      subjectCount: Number(row?.subjectCount || 0),
    }));

    const subjectDistribution = ensureArray(analytics?.subjectDistribution);
    const maxDistribution = Math.max(
      1,
      ...subjectDistribution.map((item) => Number(item?.activityCount || 0))
    );
    const subjectDistributionRows = subjectDistribution.map((item) => {
      const activityCount = Number(item?.activityCount || 0);
      const width = Math.max(6, Math.round((activityCount / maxDistribution) * 100));
      return {
        subjectName: item?.subjectName || '未命名科目',
        activityCount,
        activeDays: Number(item?.activeDays || 0),
        percentageOfTotalActivity:
          item?.percentageOfTotalActivity == null
            ? '--'
            : `${Number(item.percentageOfTotalActivity).toFixed(1)}%`,
        widthStyle: `width: ${width}%;`,
      };
    });

    const scoreTrendSubjects = ensureArray(analytics?.scoreTrends).map((item) => ({
      subjectName: item?.subjectName || '未命名科目',
      points: ensureArray(item?.points).map((point) => ({
        date: point?.date || '--',
        percentage: percentageText(point?.percentage),
        source: scoreSourceMap[point?.source] || point?.source || '--',
        title: point?.title || '--',
        score: point?.score == null ? '--' : String(point.score),
        maxScore: point?.maxScore == null ? '--' : String(point.maxScore),
      })),
    }));

    const selectedTrendIndex =
      scoreTrendSubjects.length === 0
        ? 0
        : Math.min(this.data.selectedTrendIndex || 0, scoreTrendSubjects.length - 1);

    this.setData({
      report: safeReport,
      reportType,
      displayReport,
      summaryText,
      subjectReports,
      analytics,
      overviewCards,
      strongestSubjectsText: ensureArray(overview.strongestSubjects).join('、') || '--',
      improvingSubjectsText: ensureArray(overview.improvingSubjects).join('、') || '--',
      attentionSubjectsText: ensureArray(overview.subjectsNeedingAttention).join('、') || '--',
      dailyActivityRows,
      weeklyActivityRows,
      subjectDistributionRows,
      scoreTrendSubjects,
      selectedTrendIndex,
      currentTrendPoints: scoreTrendSubjects[selectedTrendIndex]?.points || [],
      editForm: buildEditableForm(safeReport),
    });
  },

  onTrendSubjectChange(e) {
    const selectedTrendIndex = Number(e.detail.value || 0);
    this.setData({
      selectedTrendIndex,
      currentTrendPoints: this.data.scoreTrendSubjects[selectedTrendIndex]?.points || [],
    });
  },

  copyMarkdown() {
    const report = this.data.report;
    if (!report) return;
    const markdown = buildReportMarkdown(report);
    wx.setClipboardData({
      data: markdown,
      success: () => wx.showToast({ title: '已复制 Markdown', icon: 'success' }),
      fail: () => wx.showToast({ title: '复制失败', icon: 'none' }),
    });
  },

  enterEditMode() {
    if (!this.data.isManager) return;
    this.setData({ editMode: true, editForm: buildEditableForm(this.data.report) });
  },

  cancelEdit() {
    this.setData({ editMode: false, editForm: buildEditableForm(this.data.report) });
  },

  onEditFieldInput(e) {
    const field = e?.currentTarget?.dataset?.field;
    if (!field) return;
    this.setData({ [`editForm.${field}`]: e.detail.value || '' });
  },

  onSubjectSummaryInput(e) {
    const index = Number(e?.currentTarget?.dataset?.index || 0);
    const field = e?.currentTarget?.dataset?.field;
    if (!field) return;
    const subjectReports = clone(this.data.editForm?.subjectReports || []);
    if (!subjectReports[index]) return;
    subjectReports[index][field] = e.detail.value || '';
    this.setData({ 'editForm.subjectReports': subjectReports });
  },

  async saveEdits() {
    if (!this.data.isManager) return;
    if (!this.data.report?.id) {
      wx.showToast({ title: '预览模式请先保存草稿', icon: 'none' });
      return;
    }

    this.setData({ saving: true });
    try {
      const finalReport = buildFinalReportPayload(this.data.report, this.data.editForm);
      const summary = buildSummaryFromStructured(this.data.reportType, finalReport, this.data.report.summary);
      const updated = await updateReport(this.data.report.id, { finalReport, summary });
      this.applyReport(updated);
      this.setData({ editMode: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      wx.showToast({ title: err?.error || '保存失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async savePreviewAsDraft() {
    if (!this.data.isManager) return;
    const previewReport = this.data.report;
    if (!previewReport || previewReport.id) return;

    this.setData({ saving: true });
    try {
      const saved = await createReport({
        studentId: previewReport.studentId,
        reportType: previewReport.reportType,
        title: previewReport.title,
        startDate: previewReport.startDate,
        endDate: previewReport.endDate,
        year: previewReport.year,
        summary: previewReport.summary,
        analytics: previewReport.analytics,
        structuredReport: previewReport.structuredReport,
        finalReport: previewReport.finalReport,
        rawAiResponse: previewReport.rawAiResponse,
        parseError: previewReport.parseError,
        status: 'draft',
        visibleToParent: false,
      });
      wx.setStorageSync('report_preview_payload', null);
      wx.redirectTo({ url: `/pages/report-detail/index?reportId=${encodeURIComponent(saved.id)}` });
    } catch (err) {
      wx.showToast({ title: err?.error || '保存草稿失败', icon: 'none' });
    } finally {
      this.setData({ saving: false });
    }
  },

  async toggleVisibility() {
    if (!this.data.isManager || !this.data.report?.id) return;
    const visible = !!this.data.report.visibleToParent;
    this.setData({ publishing: true });
    try {
      if (!visible) {
        await updateReport(this.data.report.id, { status: 'final' });
        await updateReportVisibility(this.data.report.id, true);
        wx.showToast({ title: '已发布给家长', icon: 'success' });
      } else {
        await updateReportVisibility(this.data.report.id, false);
        wx.showToast({ title: '已取消发布', icon: 'success' });
      }
      if (this.data.previewMode) return;
      this.fetchReport();
    } catch (err) {
      wx.showToast({ title: err?.error || '操作失败', icon: 'none' });
    } finally {
      this.setData({ publishing: false });
    }
  },
});
