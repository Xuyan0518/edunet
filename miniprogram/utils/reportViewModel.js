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
      englishSpecialSummary: toText(displayReport?.englishSpecialAnalysis?.summary),
      englishSpecialTeacherSuggestion: toText(displayReport?.englishSpecialAnalysis?.teacherSuggestion),
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
    englishSpecialSummary: toText(displayReport?.englishSpecialAnalysis?.summary),
    englishSpecialTeacherSuggestion: toText(displayReport?.englishSpecialAnalysis?.teacherSuggestion),
    subjectReports,
  };
};

const buildFinalReportPayload = (report, form) => {
  const base = resolveDisplayReport(report) || {};
  const reportType = form?.reportType || resolveReportType(report);
  const subjectReports = ensureArray(form?.subjectReports);

  if (reportType === 'yearly') {
    const baseEnglish = (base.englishSpecialAnalysis && typeof base.englishSpecialAnalysis === 'object')
      ? base.englishSpecialAnalysis
      : {};
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
      englishSpecialAnalysis: {
        ...baseEnglish,
        summary: toText(form.englishSpecialSummary).trim(),
        teacherSuggestion: toText(form.englishSpecialTeacherSuggestion).trim(),
      },
    };
  }

  const baseEnglish = (base.englishSpecialAnalysis && typeof base.englishSpecialAnalysis === 'object')
    ? base.englishSpecialAnalysis
    : {};
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
    englishSpecialAnalysis: {
      ...baseEnglish,
      summary: toText(form.englishSpecialSummary).trim(),
      teacherSuggestion: toText(form.englishSpecialTeacherSuggestion).trim(),
    },
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

const TREND_LABELS = {
  improving: '上升',
  declining: '下降',
  stable: '稳定',
  insufficient_data: '数据不足',
};

const toNum = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toScoreText = (value) => {
  const n = toNum(value);
  if (n == null) return '--';
  return `${n.toFixed(1)}%`;
};

const buildMiniTrendBars = (points) => {
  const valid = ensureArray(points)
    .map((point) => toNum(point?.percentage))
    .filter((n) => n != null);
  if (!valid.length) return [];
  return valid.slice(-8).map((value, idx) => ({
    key: `${idx}-${value}`,
    heightStyle: `height:${Math.max(10, Math.round((value / 100) * 34))}rpx;`,
  }));
};

const ENGLISH_SKILL_KEYS = ['editing', 'composition', 'readingComprehension', 'grammar'];
const ENGLISH_SKILL_LABEL = {
  editing: 'Editing',
  composition: '作文',
  readingComprehension: '阅读理解',
  grammar: '语法',
};

const buildEnglishFallbackSummary = (englishAnalytics) => {
  if (!englishAnalytics || !englishAnalytics.hasEnglishData) return '暂无足够英文专项数据。';
  const skills = englishAnalytics.skillBreakdown || {};
  const highlights = ENGLISH_SKILL_KEYS
    .map((key) => skills[key])
    .filter((item) => item && Number(item.activityCount || 0) > 0)
    .map((item) => `${item.label || ENGLISH_SKILL_LABEL[item.key] || item.key}练习 ${item.activityCount} 次`)
    .slice(0, 3);
  if (!highlights.length) return '本周期有英文学习记录，但专项数据有限。';
  return `本周期英文专项覆盖：${highlights.join('；')}。`;
};

const buildEnglishSpecialSection = (reportType, displayReport, analytics) => {
  const englishAnalytics = analytics?.englishAnalytics || null;
  const aiSection = (displayReport?.englishSpecialAnalysis && typeof displayReport.englishSpecialAnalysis === 'object')
    ? displayReport.englishSpecialAnalysis
    : null;
  const hasEnglishData = !!(englishAnalytics && englishAnalytics.hasEnglishData);
  const shouldShow = hasEnglishData || !!aiSection;
  if (!shouldShow) {
    return {
      shouldShow: false,
      hasEnglishData: false,
      summary: '',
      teacherSuggestion: '',
      skillCards: [],
      vocabularyRows: [],
      vocabularyNote: '',
      aiSkillReports: [],
    };
  }

  const skillBreakdown = englishAnalytics?.skillBreakdown || {};
  const skillCards = ENGLISH_SKILL_KEYS.map((skillKey) => {
    const item = skillBreakdown[skillKey] || {};
    const trend = item.trend || 'insufficient_data';
    return {
      key: skillKey,
      label: item.label || ENGLISH_SKILL_LABEL[skillKey] || skillKey,
      activityCount: Number(item.activityCount || 0),
      scoreRecordCount: Number(item.scoreRecordCount || 0),
      averageScoreText: toScoreText(item.averageScore),
      latestScoreText: toScoreText(item.latestScore),
      trendText: TREND_LABELS[trend] || TREND_LABELS.insufficient_data,
      miniTrendBars: buildMiniTrendBars(item.scorePoints),
      emptyScore: Number(item.scoreRecordCount || 0) === 0,
    };
  });

  const vocabStats = englishAnalytics?.vocabularyStats || {};
  const vocabularyRows = [
    {
      label: '单词/词汇数量',
      value: vocabStats.vocabularyItemsCount == null ? '--' : String(vocabStats.vocabularyItemsCount),
    },
    {
      label: '句子数量',
      value: vocabStats.sentenceItemsCount == null ? '--' : String(vocabStats.sentenceItemsCount),
    },
    {
      label: '总语言积累量',
      value: vocabStats.totalLanguageItemsCount == null ? '--' : String(vocabStats.totalLanguageItemsCount),
    },
  ];
  const vocabularyNote = [
    ...(vocabStats.vocabularyItemsCount == null && Number(vocabStats.recordsWithVocabulary || 0) > 0
      ? ['有词汇练习记录，但未记录明确数量。']
      : []),
    ...(vocabStats.sentenceItemsCount == null && Number(vocabStats.recordsWithSentences || 0) > 0
      ? ['有句子练习记录，但未记录明确数量。']
      : []),
  ].join(' ');

  const aiSkillReports = ensureArray(aiSection?.skillReports).map((item) => ({
    skillKey: toText(item?.skillKey).trim(),
    skillLabel: toText(item?.skillLabel).trim() || ENGLISH_SKILL_LABEL[item?.skillKey] || '专项',
    summary: reportType === 'yearly'
      ? toText(item?.annualSummary).trim() || toText(item?.summary).trim()
      : toText(item?.summary).trim(),
    trendText: TREND_LABELS[toText(item?.trend).trim()] || '',
    activityCount: toNum(item?.activityCount),
    averageScoreText: toScoreText(item?.averageScore),
  }));

  return {
    shouldShow: true,
    hasEnglishData,
    summary:
      toText(aiSection?.summary).trim() ||
      buildEnglishFallbackSummary(englishAnalytics),
    teacherSuggestion: toText(aiSection?.teacherSuggestion).trim(),
    skillCards,
    vocabularyRows,
    vocabularyNote,
    aiSkillReports,
  };
};

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
  buildEnglishSpecialSection,
  getTagClass,
};
