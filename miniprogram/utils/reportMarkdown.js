const {
  ensureArray,
  resolveDisplayReport,
  resolveDisplaySummary,
  resolveReportType,
  normalizeRecommendation,
} = require('./reportViewModel');
const { getSubjectDisplayName } = require('./subjectDisplayName');
const MAX_MARKDOWN_ROWS = 30;

const clip = (value, max = 280) => {
  const text = String(value == null ? '' : value).trim();
  if (!text) return '';
  return text.length > max ? `${text.slice(0, max)}...` : text;
};

const fmtDateRange = (report = {}) => {
  if (report.reportType === 'yearly' && report.year) {
    return `${report.year} 年（${report.startDate || '--'} ~ ${report.endDate || '--'}）`;
  }
  return `${report.startDate || '--'} ~ ${report.endDate || '--'}`;
};

const list = (items) => ensureArray(items).slice(0, MAX_MARKDOWN_ROWS).map((item) => `- ${clip(item, 180)}`).join('\n');

const renderSubjectReports = (reportType, subjectReports = []) => {
  if (!subjectReports.length) return '暂无科目报告';

  if (reportType === 'yearly') {
    return subjectReports
      .map((subject) => {
        const parts = [
          `### ${getSubjectDisplayName(subject.subjectName || '未命名科目')}`,
          subject.annualSummary ? subject.annualSummary : '暂无年度总结。',
          ensureArray(subject.growth).length ? `- 成长点：${ensureArray(subject.growth).join('；')}` : '',
          ensureArray(subject.challenges).length ? `- 挑战点：${ensureArray(subject.challenges).join('；')}` : '',
          ensureArray(subject.nextYearFocus).length ? `- 下阶段重点：${ensureArray(subject.nextYearFocus).join('；')}` : '',
          ensureArray(subject.evidence).length ? `- 依据：${ensureArray(subject.evidence).join('；')}` : '',
        ].filter(Boolean);
        return parts.join('\n');
      })
      .join('\n\n');
  }

  return subjectReports
    .slice(0, MAX_MARKDOWN_ROWS)
    .map((subject) => {
      const parts = [
        `### ${getSubjectDisplayName(subject.subjectName || '未命名科目')}`,
        subject.summary ? clip(subject.summary, 280) : '暂无学科总结。',
        ensureArray(subject.strengths).length ? `- 优势：${ensureArray(subject.strengths).join('；')}` : '',
        ensureArray(subject.areasToImprove).length ? `- 待提升：${ensureArray(subject.areasToImprove).join('；')}` : '',
        ensureArray(subject.nextSteps).length ? `- 下一步：${ensureArray(subject.nextSteps).join('；')}` : '',
        ensureArray(subject.evidence).length ? `- 依据：${ensureArray(subject.evidence).join('；')}` : '',
      ].filter(Boolean);
      return parts.join('\n');
    })
    .join('\n\n');
};

const renderRecommendations = (recommendations = []) => {
  if (!recommendations.length) return '暂无建议';
  return recommendations
    .slice(0, MAX_MARKDOWN_ROWS)
    .map((item) => normalizeRecommendation(item))
    .map((item) => `- [${item.priority}] ${clip(item.area || '建议', 80)}：${clip(item.recommendation || '暂无内容', 220)}`)
    .join('\n');
};

const renderEnglishSpecialAnalysis = (reportType, displayReport = {}, analytics = {}) => {
  const englishAi = displayReport?.englishSpecialAnalysis && typeof displayReport.englishSpecialAnalysis === 'object'
    ? displayReport.englishSpecialAnalysis
    : null;
  const englishAnalytics = analytics?.englishAnalytics || null;
  if (!englishAi && !(englishAnalytics && englishAnalytics.hasEnglishData)) return '';

  const lines = ['## 英文专项分析'];
  const summary = englishAi?.summary || '';
  if (summary) {
    lines.push(summary);
  } else if (englishAnalytics?.hasEnglishData) {
    lines.push('本周期存在英文专项学习记录，具体数据见下：');
  }

  const skillReports = Array.isArray(englishAi?.skillReports) ? englishAi.skillReports.slice(0, MAX_MARKDOWN_ROWS) : [];
  if (skillReports.length) {
    for (const item of skillReports) {
      const label = item.skillLabel || item.skillKey || '专项';
      const summaryText = reportType === 'yearly'
        ? item.annualSummary || item.summary || '暂无总结'
        : item.summary || '暂无总结';
      lines.push(`- ${clip(label, 80)}：${clip(summaryText, 220)}`);
    }
  } else if (englishAnalytics?.skillBreakdown) {
    ['editing', 'composition', 'readingComprehension', 'grammar'].forEach((key) => {
      const row = englishAnalytics.skillBreakdown[key];
      if (!row) return;
      lines.push(`- ${row.label || key}：练习 ${row.activityCount || 0} 次，平均分 ${row.averageScore ?? '--'}，趋势 ${row.trend || 'insufficient_data'}`);
    });
  }

  const vocab = englishAi?.vocabularySummary || englishAnalytics?.vocabularyStats || null;
  if (vocab) {
    lines.push(
      `- 词汇/句子：词汇 ${vocab.vocabularyItemsCount ?? '--'}，句子 ${vocab.sentenceItemsCount ?? '--'}，总量 ${vocab.totalLanguageItemsCount ?? '--'}`
    );
    if (vocab.summary) lines.push(`- 词汇补充：${vocab.summary}`);
  }

  if (englishAi?.teacherSuggestion) {
    lines.push(`- 老师建议：${englishAi.teacherSuggestion}`);
  }

  return lines.join('\n');
};

const buildReportMarkdown = (report = {}) => {
  const reportType = resolveReportType(report);
  const displayReport = resolveDisplayReport(report);
  const summary = resolveDisplaySummary(report);
  const title = report.title || (reportType === 'yearly' ? '学生年度学习报告' : '学生学期学习报告');

  const lines = [
    `# ${title}`,
    '',
    `- 报告类型：${reportType === 'yearly' ? '年度报告' : '学期报告'}`,
    `- 日期范围：${fmtDateRange(report)}`,
    `- 报告状态：${report.status === 'final' ? '最终版' : '草稿'}`,
    `- 对家长可见：${report.visibleToParent ? '是' : '否'}`,
    '',
    '## 总体总结',
  ];

  if (!displayReport) {
    lines.push(summary || '暂无总结内容');
    return lines.join('\n');
  }

  if (reportType === 'yearly') {
    lines.push(displayReport.annualExecutiveSummary || summary || '暂无总体总结');
    lines.push('', '## 学习亮点');
    lines.push(list(displayReport.annualGrowthHighlights) || '暂无亮点');
    lines.push('', '## 需要关注');
    lines.push(list(displayReport.longTermConcerns) || '暂无重点关注项');
  } else {
    lines.push(displayReport.executiveSummary || summary || '暂无总体总结');
    lines.push('', '## 学习亮点');
    lines.push(list(displayReport.keyHighlights) || '暂无亮点');
    lines.push('', '## 需要关注');
    lines.push(list(displayReport.keyConcerns) || '暂无重点关注项');
  }

  const overview = report.analytics?.overview || {};
  lines.push('', '## 核心数据');
  lines.push(`- 活跃天数：${overview.activeDays ?? '--'}`);
  lines.push(`- 活跃率：${overview.activeRate != null ? `${overview.activeRate}%` : '--'}`);
  lines.push(`- 科目数：${overview.totalSubjects ?? '--'}`);
  lines.push(`- 试卷数：${overview.totalPapers ?? '--'}`);
  lines.push(`- 考试数：${overview.totalExams ?? '--'}`);

  lines.push('', '## 各科报告');
  lines.push(renderSubjectReports(reportType, ensureArray(displayReport.subjectReports)));

  lines.push('', reportType === 'yearly' ? '## 下一年度建议' : '## 下一阶段建议');
  const recommendations = reportType === 'yearly'
    ? ensureArray(displayReport.nextYearRecommendations)
    : ensureArray(displayReport.nextStageRecommendations);
  lines.push(renderRecommendations(recommendations));

  const englishSection = renderEnglishSpecialAnalysis(reportType, displayReport, report.analytics || {});
  if (englishSection) {
    lines.push('', englishSection);
  }

  lines.push('', reportType === 'yearly' ? '## 老师年度评语' : '## 老师评语');
  lines.push(
    reportType === 'yearly'
      ? displayReport.teacherAnnualComment || '暂无老师评语'
      : displayReport.teacherComment || '暂无老师评语'
  );

  return lines.join('\n');
};

module.exports = {
  buildReportMarkdown,
};
