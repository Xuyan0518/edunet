const PRIORITY_LABEL = {
  high: '重点',
  medium: '中等',
  low: '一般',
};
const { getSubjectDisplayName } = require('./subjectDisplayName');

const ensureArray = (value) => (Array.isArray(value) ? value.filter((item) => item != null && item !== '') : []);

const toText = (value) => (value == null ? '' : String(value));

const splitLines = (value) =>
  toText(value)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const joinLines = (value) => ensureArray(value).map((item) => toText(item).trim()).filter(Boolean).join('\n');

const resolveDisplayReport = (report) => {
  if (!report || typeof report !== 'object') return null;
  return report.finalReport || report.structuredReport || null;
};

const resolveDisplaySummary = (report) => {
  const text = toText(report?.summary).trim();
  return text || '暂无报告内容';
};

const resolveReportType = (report) => {
  if (report?.reportType === 'yearly') return 'yearly';
  return 'quarterly';
};

const normalizeRecommendation = (entry) => {
  if (!entry || typeof entry !== 'object') {
    return { area: '', recommendation: '', priority: 'medium' };
  }
  const priority = entry.priority === 'high' || entry.priority === 'low' || entry.priority === 'medium'
    ? entry.priority
    : 'medium';
  return {
    area: toText(entry.area).trim(),
    recommendation: toText(entry.recommendation).trim(),
    priority,
  };
};

const parseRecommendationLines = (value) =>
  splitLines(value).map((line) => {
    const parts = line.split('|').map((part) => part.trim());
    return normalizeRecommendation({
      area: parts[0] || '',
      recommendation: parts[1] || '',
      priority: parts[2] || 'medium',
    });
  });

const recommendationLinesFromArray = (value) =>
  ensureArray(value)
    .map((item) => normalizeRecommendation(item))
    .map((item) => `${item.area}|${item.recommendation}|${item.priority}`)
    .join('\n');

const normalizeSubjectReports = (reportType, displayReport) => {
  const subjectReports = ensureArray(displayReport?.subjectReports);
  if (reportType === 'yearly') {
    return subjectReports.map((item) => ({
      ...(item && typeof item === 'object' ? item : {}),
      subjectName: getSubjectDisplayName(toText(item?.subjectName).trim() || '未命名科目'),
      annualSummary: toText(item?.annualSummary).trim(),
      growth: ensureArray(item?.growth),
      challenges: ensureArray(item?.challenges),
      nextYearFocus: ensureArray(item?.nextYearFocus),
      evidence: ensureArray(item?.evidence),
    }));
  }

  return subjectReports.map((item) => ({
    ...(item && typeof item === 'object' ? item : {}),
    subjectName: getSubjectDisplayName(toText(item?.subjectName).trim() || '未命名科目'),
    summary: toText(item?.summary).trim(),
    strengths: ensureArray(item?.strengths),
    areasToImprove: ensureArray(item?.areasToImprove),
    nextSteps: ensureArray(item?.nextSteps),
    evidence: ensureArray(item?.evidence),
  }));
};

const buildEditableForm = (report) => {
  const resolvedDisplay = resolveDisplayReport(report);
  const displayReport = resolvedDisplay || {};
  const reportType = resolveReportType(report);
  const subjectReports = normalizeSubjectReports(reportType, displayReport);
  const fallbackSummary = toText(report?.summary).trim();

  if (reportType === 'yearly') {
    return {
      reportType,
      annualExecutiveSummary: toText(displayReport.annualExecutiveSummary) || fallbackSummary,
      annualGrowthHighlightsText: joinLines(displayReport.annualGrowthHighlights),
      longTermConcernsText: joinLines(displayReport.longTermConcerns),
      teacherAnnualComment: toText(displayReport.teacherAnnualComment),
      nextYearRecommendationsText: recommendationLinesFromArray(displayReport.nextYearRecommendations),
      subjectReports,
    };
  }

  return {
    reportType,
    executiveSummary: toText(displayReport.executiveSummary) || fallbackSummary,
    keyHighlightsText: joinLines(displayReport.keyHighlights),
    keyConcernsText: joinLines(displayReport.keyConcerns),
    teacherComment: toText(displayReport.teacherComment),
    nextStageRecommendationsText: recommendationLinesFromArray(displayReport.nextStageRecommendations),
    subjectReports,
  };
};

const buildFinalReportPayload = (report, form) => {
  const base = resolveDisplayReport(report) || {};
  const reportType = form?.reportType || resolveReportType(report);
  const subjectReports = ensureArray(form?.subjectReports);

  if (reportType === 'yearly') {
    return {
      ...base,
      reportType: 'yearly',
      annualExecutiveSummary: toText(form.annualExecutiveSummary).trim(),
      annualGrowthHighlights: splitLines(form.annualGrowthHighlightsText),
      longTermConcerns: splitLines(form.longTermConcernsText),
      subjectReports: subjectReports.map((item) => ({
        ...item,
        subjectName: getSubjectDisplayName(toText(item.subjectName).trim() || '未命名科目'),
        annualSummary: toText(item.annualSummary).trim(),
      })),
      nextYearRecommendations: parseRecommendationLines(form.nextYearRecommendationsText),
      teacherAnnualComment: toText(form.teacherAnnualComment).trim(),
    };
  }

  return {
    ...base,
    reportType: 'quarterly',
    executiveSummary: toText(form.executiveSummary).trim(),
    keyHighlights: splitLines(form.keyHighlightsText),
    keyConcerns: splitLines(form.keyConcernsText),
    subjectReports: subjectReports.map((item) => ({
      ...item,
      subjectName: getSubjectDisplayName(toText(item.subjectName).trim() || '未命名科目'),
      summary: toText(item.summary).trim(),
    })),
    nextStageRecommendations: parseRecommendationLines(form.nextStageRecommendationsText),
    teacherComment: toText(form.teacherComment).trim(),
  };
};

const buildSummaryFromStructured = (reportType, structuredReport, fallbackSummary = '') => {
  if (!structuredReport || typeof structuredReport !== 'object') {
    const fallback = toText(fallbackSummary).trim();
    return fallback || '暂无报告内容';
  }

  if (reportType === 'yearly') {
    const lines = [
      toText(structuredReport.annualExecutiveSummary).trim(),
      ...ensureArray(structuredReport.annualGrowthHighlights).map((item) => `- ${item}`),
      ...ensureArray(structuredReport.longTermConcerns).map((item) => `- 关注：${item}`),
      ...ensureArray(structuredReport.subjectReports).map((item) => `${getSubjectDisplayName(item.subjectName || '科目')}：${toText(item.annualSummary).trim()}`),
      ...ensureArray(structuredReport.nextYearRecommendations)
        .map((item) => normalizeRecommendation(item))
        .map((item) => `${item.area || '建议'}（${PRIORITY_LABEL[item.priority]}）：${item.recommendation}`),
      toText(structuredReport.teacherAnnualComment).trim(),
    ].filter(Boolean);

    return lines.join('\n') || toText(fallbackSummary).trim() || '暂无报告内容';
  }

  const lines = [
    toText(structuredReport.executiveSummary).trim(),
    ...ensureArray(structuredReport.keyHighlights).map((item) => `- ${item}`),
    ...ensureArray(structuredReport.keyConcerns).map((item) => `- 关注：${item}`),
    ...ensureArray(structuredReport.subjectReports).map((item) => `${getSubjectDisplayName(item.subjectName || '科目')}：${toText(item.summary).trim()}`),
    ...ensureArray(structuredReport.nextStageRecommendations)
      .map((item) => normalizeRecommendation(item))
      .map((item) => `${item.area || '建议'}（${PRIORITY_LABEL[item.priority]}）：${item.recommendation}`),
    toText(structuredReport.teacherComment).trim(),
  ].filter(Boolean);

  return lines.join('\n') || toText(fallbackSummary).trim() || '暂无报告内容';
};

const startOfWeekMonday = (date) => {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() - day + 1);
  return d;
};

const toYmd = (date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

const buildWeeklyActivityRows = (analytics) => {
  const weekly = ensureArray(analytics?.learningActivity?.weeklyActivity);
  if (weekly.length) {
    return weekly.map((row) => ({
      weekStart: toText(row?.weekStart).trim() || '--',
      weekEnd: toText(row?.weekEnd).trim() || '--',
      weekText: `${toText(row?.weekStart).trim() || '--'} ~ ${toText(row?.weekEnd).trim() || '--'}`,
      activeDays: Number(row?.activeDays || 0),
      activityCount: Number(row?.activityCount || 0),
      subjectCount: Number(row?.subjectCount || 0),
    }));
  }

  const daily = ensureArray(analytics?.learningActivity?.dailyActivity);
  const map = new Map();
  for (const row of daily) {
    const dateText = toText(row?.date).trim();
    if (!dateText) continue;
    const date = new Date(dateText);
    if (Number.isNaN(date.getTime())) continue;
    const weekStart = startOfWeekMonday(date);
    const key = toYmd(weekStart);
    const current = map.get(key) || {
      weekStart: key,
      weekEnd: toYmd(new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + 6)),
      activeDays: 0,
      activityCount: 0,
      subjectCount: 0,
    };
    const activityCount = Number(row?.activityCount || 0);
    current.activityCount += activityCount;
    current.subjectCount += Number(row?.subjectCount || 0);
    if (activityCount > 0) current.activeDays += 1;
    map.set(key, current);
  }
  return Array.from(map.values())
    .sort((a, b) => (a.weekStart > b.weekStart ? 1 : -1))
    .map((item) => ({
      ...item,
      weekText: `${item.weekStart} ~ ${item.weekEnd}`,
    }));
};

const TAG_TYPE_CLASS = {
  strength: 'tag-strength',
  improvement: 'tag-improve',
  next: 'tag-next',
  evidence: 'tag-evidence',
};

const getTagClass = (tagType) => TAG_TYPE_CLASS[tagType] || 'tag-evidence';

module.exports = {
  PRIORITY_LABEL,
  ensureArray,
  splitLines,
  joinLines,
  resolveDisplayReport,
  resolveDisplaySummary,
  resolveReportType,
  normalizeSubjectReports,
  buildEditableForm,
  buildFinalReportPayload,
  buildSummaryFromStructured,
  normalizeRecommendation,
  buildWeeklyActivityRows,
  getTagClass,
};
