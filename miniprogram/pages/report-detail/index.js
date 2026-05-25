const {
  getReport,
  updateReport,
  updateReportVisibility,
  deleteReport,
  createReport,
  resolveRoleFlags,
} = require('../../utils/reportApi');
const { buildReportMarkdown } = require('../../utils/reportMarkdown');
const { getSubjectDisplayName } = require('../../utils/subjectDisplayName');
const { showActionLockToast } = require('../../utils/actionLock');
const {
  ensureArray,
  resolveDisplayReport,
  resolveDisplaySummary,
  resolveReportType,
  normalizeSubjectReports,
  buildEditableForm,
  buildFinalReportPayload,
  buildSummaryFromStructured,
  buildWeeklyActivityRows,
  buildEnglishSpecialSection,
} = require('../../utils/reportViewModel');
const { LIMITS, trimText, sanitizeScorePoints } = require('../../utils/validation');

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

const clone = (value) => JSON.parse(JSON.stringify(value));
const isEnglishSubject = (name = '') => {
  const text = String(name || '').toLowerCase();
  return text.includes('english') || String(name || '').includes('英文') || String(name || '').includes('英语');
};

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
    attendanceAndStudyTime: null,
    overviewCards: [],
    strongestSubjectsText: '--',
    improvingSubjectsText: '--',
    attentionSubjectsText: '--',
    weeklyActivityRows: [],
    englishSpecialSection: null,
    subjectDistributionRows: [],
    scoreTrendSubjects: [],
    selectedTrendIndex: 0,
    currentTrendPoints: [],
    finalOverallSummary: '',
    finalNextSuggestions: [],
    englishSummaryRows: [],
    subjectSummaryCards: [],
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
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || err?.error || '获取报告失败', icon: 'none' });
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
    const englishSpecialSection = buildEnglishSpecialSection(reportType, displayReport || {}, analytics);
    const overview = analytics?.overview || {};
    const attendanceAndStudyTime = analytics?.attendanceAndStudyTime || null;

    const overviewCards = [
      { label: '活跃天数', value: overview.activeDays ?? '--' },
      { label: '活跃率', value: toPercent(overview.activeRate) },
      { label: '科目数', value: overview.totalSubjects ?? '--' },
      { label: '试卷数', value: overview.totalPapers ?? '--' },
      { label: '考试数', value: overview.totalExams ?? '--' },
    ];

    const weeklyActivityRowsBase = buildWeeklyActivityRows(analytics);
    const maxWeeklyActivity = Math.max(
      1,
      ...weeklyActivityRowsBase.map((item) => Number(item?.activityCount || 0))
    );
    const weeklyActivityRows = weeklyActivityRowsBase.map((row) => {
      const activityCount = Number(row?.activityCount || 0);
      const width = Math.max(8, Math.round((activityCount / maxWeeklyActivity) * 100));
      return {
        ...row,
        widthStyle: `width: ${width}%;`,
      };
    });

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
        subjectDisplayName: getSubjectDisplayName(item?.subjectName || '未命名科目'),
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
      subjectDisplayName: getSubjectDisplayName(item?.subjectName || '未命名科目'),
      points: sanitizeScorePoints(ensureArray(item?.points), LIMITS.scorePointsRenderMax).map((point) => ({
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

    const recommendationField = reportType === 'yearly'
      ? ensureArray(displayReport?.nextYearRecommendations)
      : ensureArray(displayReport?.nextStageRecommendations);
    const finalNextSuggestions = recommendationField
      .map((item) => {
        const row = item && typeof item === 'object' ? item : {};
        const area = String(row.area || '').trim();
        const recommendation = String(row.recommendation || '').trim();
        return [area, recommendation].filter(Boolean).join('：');
      })
      .filter(Boolean)
      .slice(0, 5);

    const finalOverallSummary = reportType === 'yearly'
      ? (
          String(displayReport?.teacherAnnualComment || '').trim() ||
          String(displayReport?.annualExecutiveSummary || '').trim() ||
          summaryText
        )
      : (
          String(displayReport?.teacherComment || '').trim() ||
          String(displayReport?.executiveSummary || '').trim() ||
          summaryText
        );

    const englishAnalytics = analytics?.englishAnalytics || {};
    const skillBreakdown = englishAnalytics?.skillBreakdown || {};
    const englishSummaryRows = [
      { key: 'editing', label: 'Editing', data: skillBreakdown.editing || {} },
      { key: 'composition', label: 'Essay', data: skillBreakdown.composition || {} },
      { key: 'readingComprehension', label: 'Reading Comprehension', data: skillBreakdown.readingComprehension || {} },
      { key: 'grammar', label: 'Grammar', data: skillBreakdown.grammar || {} },
    ].map((row) => {
      const activityCount = Number(row.data.activityCount || 0);
      const avg = row.data.averageScore;
      const averageText = avg == null ? '暂无足够数据' : `${Number(avg).toFixed(1)}%`;
      return {
        label: row.label,
        countText: activityCount > 0 ? `完成 ${activityCount} 次` : '暂无足够数据',
        averageText,
      };
    });
    const vocabStats = englishAnalytics?.vocabularyStats || {};
    englishSummaryRows.push({
      label: 'Vocab',
      countText:
        (vocabStats.vocabularyItemsCount != null || vocabStats.sentenceItemsCount != null)
          ? `单词 ${vocabStats.vocabularyItemsCount == null ? '--' : vocabStats.vocabularyItemsCount} 个，句子 ${vocabStats.sentenceItemsCount == null ? '--' : vocabStats.sentenceItemsCount} 个`
          : '暂无足够数据',
      averageText: '',
    });
    const customTaskStats = ensureArray(englishAnalytics?.customTaskStats).map((task) => {
      const completedCount = Number(task?.completedCount || 0);
      const avg = task?.averageScore;
      return {
        label: task?.displayName || task?.key || '自定义英文任务',
        countText: completedCount > 0 ? `完成 ${completedCount} 次` : '暂无足够数据',
        averageText: avg == null ? '暂无足够数据' : `${Number(avg).toFixed(1)}%`,
      };
    });
    const englishRowsCombined = [...englishSummaryRows, ...customTaskStats];
    const seenLabels = new Set();
    const englishSummaryRowsFinal = englishRowsCombined.filter((row) => {
      const key = String(row.label || '');
      if (!key || seenLabels.has(key)) return false;
      seenLabels.add(key);
      return true;
    });

    const subjectSummaryCards = subjectReports
      .filter((item) => !isEnglishSubject(item?.subjectName))
      .map((item) => {
        const subjectName = item?.subjectName || '未命名科目';
        const summary = reportType === 'yearly'
          ? String(item?.annualSummary || '').trim()
          : String(item?.summary || '').trim();
        if (summary) {
          return { subjectName, summary };
        }
        const matched = ensureArray(analytics?.subjectStats).find((s) => s?.subjectName === subjectName) || null;
        if (!matched) {
          return { subjectName, summary: '该阶段记录较少，暂无法形成完整趋势判断。' };
        }
        const scoreText = matched.averageScore == null ? '暂无足够分数数据' : `平均分约 ${matched.averageScore}%`;
        const trendMap = {
          improving: '趋势上升',
          declining: '趋势下行',
          stable: '趋势稳定',
          insufficient_data: '成绩数据有限，暂不判断趋势',
        };
        const trendText = trendMap[matched.trend] || '成绩数据有限';
        return {
          subjectName,
          summary: `本阶段共记录 ${matched.activityCount || 0} 次学习，活跃 ${matched.activeDays || 0} 天，${scoreText}，${trendText}。`,
        };
      });

    this.setData({
      report: safeReport,
      reportType,
      displayReport,
      summaryText,
      subjectReports,
      analytics,
      attendanceAndStudyTime,
      overviewCards,
      strongestSubjectsText: ensureArray(overview.strongestSubjects).map(getSubjectDisplayName).join('、') || '--',
      improvingSubjectsText: ensureArray(overview.improvingSubjects).map(getSubjectDisplayName).join('、') || '--',
      attentionSubjectsText: ensureArray(overview.subjectsNeedingAttention).map(getSubjectDisplayName).join('、') || '--',
      weeklyActivityRows,
      englishSpecialSection,
      subjectDistributionRows,
      scoreTrendSubjects,
      selectedTrendIndex,
      currentTrendPoints: scoreTrendSubjects[selectedTrendIndex]?.points || [],
      finalOverallSummary,
      finalNextSuggestions,
      englishSummaryRows: englishSummaryRowsFinal,
      subjectSummaryCards,
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
      const editForm = this.data.editForm || {};
      const textFields = [
        ['执行摘要', editForm.executiveSummary || editForm.annualExecutiveSummary, LIMITS.reportTextMax],
        ['老师评语', editForm.teacherComment || editForm.teacherAnnualComment, LIMITS.reportTextMax],
        ['英文专项总结', editForm.englishSpecialSummary, LIMITS.reportTextMax],
        ['英文专项建议', editForm.englishSpecialTeacherSuggestion, LIMITS.reportTextMax],
      ];
      for (const [label, value, max] of textFields) {
        if (trimText(value).length > max) {
          wx.showToast({ title: `${label}过长`, icon: 'none' });
          return;
        }
      }
      const finalReport = buildFinalReportPayload(this.data.report, this.data.editForm);
      const summary = buildSummaryFromStructured(this.data.reportType, finalReport, this.data.report.summary);
      const updated = await updateReport(this.data.report.id, { finalReport, summary });
      this.applyReport(updated);
      this.setData({ editMode: false });
      wx.showToast({ title: '保存成功', icon: 'success' });
    } catch (err) {
      if (showActionLockToast(err)) return;
      wx.showToast({ title: err?.message || err?.error || '保存失败', icon: 'none' });
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
      if (showActionLockToast(err)) return;
      wx.showToast({ title: err?.message || err?.error || '保存草稿失败', icon: 'none' });
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
      if (showActionLockToast(err)) return;
      wx.showToast({ title: err?.message || err?.error || '操作失败', icon: 'none' });
    } finally {
      this.setData({ publishing: false });
    }
  },

  async deleteCurrentReport() {
    if (!this.data.isManager || this.data.previewMode || !this.data.report?.id) return;
    const reportId = this.data.report.id;
    const studentId = this.data.report.studentId;
    wx.showModal({
      title: '确认删除',
      content: '确认删除这份报告吗？删除后无法恢复。',
      confirmColor: '#dc2626',
      success: async (result) => {
        if (!result.confirm) return;
        try {
          wx.showLoading({ title: '删除中...' });
          await deleteReport(reportId);
          wx.showToast({ title: '已删除', icon: 'success' });
          const target = studentId
            ? `/pages/reports/index?studentId=${encodeURIComponent(studentId)}`
            : '/pages/students/index';
          wx.redirectTo({ url: target });
        } catch (err) {
          if (showActionLockToast(err)) return;
          wx.showToast({ title: err?.message || err?.error || '删除失败', icon: 'none' });
        } finally {
          wx.hideLoading();
        }
      },
    });
  },
});
