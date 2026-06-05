export type StructuredReportType = 'quarterly' | 'yearly';

export type ParsedStructuredReportResult = {
  structuredReport: Record<string, unknown> | null;
  summaryText: string;
  rawAiResponse: string;
  parseError: string | null;
};

const DEFAULT_EMPTY_SUMMARY = '当前AI未返回有效报告内容，请稍后重试。';

export const DEEPSEEK_QUARTERLY_PROMPT = `你是一名负责向家长汇报学习情况的一线老师。现在请你基于系统给出的 context 生成“学期学习报告”JSON。

事实来源优先级（必须遵守）：
1) analytics 与 subjectContext 是主要事实来源。
2) dailyProgress / weeklyReports / papers / exams 是补充证据。
3) previousQuarterContext（若有）用于本学期和上一学期对比。
4) 绝对禁止编造任何数据、成绩、趋势、优点、问题或事件。

写作要求（必须遵守）：
1) 中文，语气亲和、专业、像老师写给家长。
2) subjectReports 必须覆盖 context 中出现的每个科目（优先 subjectContext，其次 analytics.subjectStats）。
3) 每个科目 summary 必须是“通顺段落”，不要“阶段概览：”“成绩对比：”这类机械标签。
4) 每个科目 summary 需要尽量覆盖：
   - 这段时间学了什么/训练重点
   - 表现与趋势（若有分数）
   - 试卷/测验/考试的关键信息（若有）
   - 做得好的地方
   - 需要加强的地方与下一步建议
4.1) 每个科目 summary 至少 4 句，建议 4-6 句；建议不少于 120 个中文字符。
4.2) 每个科目 summary 禁止只写两三句泛化结论，必须有具体事实支撑（日期/分数/任务/问题点至少两类）。
5) 若某科在本时间段内有试卷/考试记录，summary 必须提到至少一条具体测评信息（日期/名称/分数或得分率其一）。
6) 如果分数对象同时有 scoreText 与 percentage，描述具体成绩时优先引用 scoreText（如 28/30），描述趋势/平均时引用 percentage；绝对不要把 28/30 的原始 score=28 当成 28%。
7) 若某科没有可用分数，只评价学习投入、完成情况和问题点，不要硬写分数趋势。
8) 如 analytics.englishAnalytics.hasEnglishData=true，必须输出 englishSpecialAnalysis，且只依据 englishAnalytics。
9) priority 只能是 high/medium/low。
10) dataQualityNotesForTeacher 需要参考 analytics.aiGuidance.dataQualityNotes，但不要在家长可读主文案反复出现“数据有限”等机械句式。
11) 输出必须是单个 valid JSON object，不要 markdown 代码块，不要 JSON 外文字。

请严格按以下 JSON 结构输出：
{
  "reportTitle": "学生学期学习报告",
  "reportType": "quarterly",
  "period": {"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"},
  "studentProfile": {"label":"...","description":"..."},
  "executiveSummary": "...",
  "keyHighlights": ["..."],
  "keyConcerns": ["..."],
  "learningHabitAnalysis": {"summary":"...","strengths":["..."],"areasToImprove":["..."]},
  "scoreTrendAnalysis": {
    "summary":"...",
    "improvingSubjects":[{"subjectName":"...","explanation":"..."}],
    "subjectsNeedingAttention":[{"subjectName":"...","explanation":"..."}]
  },
  "subjectReports": [
    {"subjectName":"...","summary":"...","strengths":["..."],"areasToImprove":["..."],"nextSteps":["..."],"evidence":["..."]}
  ],
  "nextStageRecommendations": [
    {"area":"...","recommendation":"...","priority":"high"}
  ],
  "englishSpecialAnalysis": {
    "summary":"...",
    "skillReports":[
      {"skillKey":"editing","skillLabel":"Editing","summary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextSteps":["..."]},
      {"skillKey":"composition","skillLabel":"作文","summary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextSteps":["..."]},
      {"skillKey":"readingComprehension","skillLabel":"阅读理解","summary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextSteps":["..."]},
      {"skillKey":"grammar","skillLabel":"语法","summary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextSteps":["..."]}
    ],
    "vocabularySummary":{"summary":"...","vocabularyItemsCount":null,"sentenceItemsCount":null,"totalLanguageItemsCount":null},
    "teacherSuggestion":"..."
  },
  "teacherComment":"...",
  "dataQualityNotesForTeacher":["..."]
}`;

export const DEEPSEEK_YEARLY_PROMPT = `你是一名负责向家长汇报学习情况的一线老师。现在请你基于系统给出的 context 生成“年度学习报告”JSON。

事实来源优先级（必须遵守）：
1) analytics 与 subjectContext 是主要事实来源。
2) dailyProgress / weeklyReports / papers / exams 是补充证据。
3) quarterlySummariesInYear（若有）必须用于年度纵向分析。
4) 绝对禁止编造任何数据、成绩、趋势、优点、问题或事件。

写作要求（必须遵守）：
1) 中文，语气亲和、专业、像老师写给家长。
2) subjectReports 必须覆盖 context 中出现的每个科目（优先 subjectContext，其次 analytics.subjectStats）。
3) 每个科目 annualSummary 必须是“通顺段落”，不要机械小标题。
4) 每个科目 annualSummary 需要尽量覆盖：
   - 年度学习重点与训练范围
   - 阶段成绩变化与趋势（若有）
   - 试卷/测验/考试的对比信息（若有）
   - 稳定优势
   - 主要短板
   - 下一学年的改进重点
4.1) 每个科目 annualSummary 至少 4 句，建议 4-6 句；建议不少于 140 个中文字符。
4.2) 每个科目 annualSummary 禁止只写两三句泛化结论，必须有具体事实支撑（日期/分数/任务/问题点至少两类）。
5) 若某科在本年度有试卷/考试记录，annualSummary 必须提到至少一条具体测评信息（日期/名称/分数或得分率其一）。
6) 如果分数对象同时有 scoreText 与 percentage，描述具体成绩时优先引用 scoreText（如 28/30），描述趋势/平均时引用 percentage；绝对不要把 28/30 的原始 score=28 当成 28%。
7) 若某科没有可用分数，只评价学习投入、完成情况和问题点，不要硬写分数趋势。
8) 如 analytics.englishAnalytics.hasEnglishData=true，必须输出 englishSpecialAnalysis，且只依据 englishAnalytics。
9) priority 只能是 high/medium/low。
10) dataQualityNotesForTeacher 需要参考 analytics.aiGuidance.dataQualityNotes，但不要在家长可读主文案反复出现“数据有限”等机械句式。
11) 输出必须是单个 valid JSON object，不要 markdown 代码块，不要 JSON 外文字。

请严格按以下 JSON 结构输出：
{
  "reportTitle":"学生年度学习报告",
  "reportType":"yearly",
  "year":2026,
  "period":{"startDate":"YYYY-MM-DD","endDate":"YYYY-MM-DD"},
  "annualStudentProfile":{"label":"...","description":"..."},
  "annualExecutiveSummary":"...",
  "annualGrowthHighlights":["..."],
  "longTermConcerns":["..."],
  "quarterlyComparison":{"summary":"...","developmentAcrossYear":"..."},
  "learningHabitAnalysis":{"summary":"...","improvements":["..."],"remainingIssues":["..."]},
  "scoreTrendAnalysis":{
    "summary":"...",
    "strongestSubjects":[{"subjectName":"...","explanation":"..."}],
    "mostImprovedSubjects":[{"subjectName":"...","explanation":"..."}],
    "subjectsNeedingAttention":[{"subjectName":"...","explanation":"..."}]
  },
  "subjectReports":[
    {"subjectName":"...","annualSummary":"...","growth":["..."],"challenges":["..."],"nextYearFocus":["..."],"evidence":["..."]}
  ],
  "nextYearRecommendations":[
    {"area":"...","recommendation":"...","priority":"high"}
  ],
  "englishSpecialAnalysis": {
    "summary":"...",
    "skillReports":[
      {"skillKey":"editing","skillLabel":"Editing","annualSummary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextYearFocus":["..."]},
      {"skillKey":"composition","skillLabel":"作文","annualSummary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextYearFocus":["..."]},
      {"skillKey":"readingComprehension","skillLabel":"阅读理解","annualSummary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextYearFocus":["..."]},
      {"skillKey":"grammar","skillLabel":"语法","annualSummary":"...","activityCount":0,"averageScore":null,"trend":"insufficient_data","nextYearFocus":["..."]}
    ],
    "vocabularySummary":{"summary":"...","vocabularyItemsCount":null,"sentenceItemsCount":null,"totalLanguageItemsCount":null},
    "teacherSuggestion":"..."
  },
  "teacherAnnualComment":"...",
  "dataQualityNotesForTeacher":["..."]
}`;

// Backward-compatible aliases for any previous imports.
export const DEEPSEEK_QUARTERLY_PROMPT_DEFAULT = DEEPSEEK_QUARTERLY_PROMPT;
export const DEEPSEEK_YEARLY_PROMPT_DEFAULT = DEEPSEEK_YEARLY_PROMPT;

const asText = (v: unknown) => (typeof v === 'string' ? v.trim() : '');

const toStrList = (v: unknown) => (Array.isArray(v) ? v.map((x) => asText(x)).filter(Boolean) : []);

const stripMarkdownFence = (raw: string) => {
  const trimmed = raw.trim();
  const matched = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return matched ? matched[1].trim() : trimmed;
};

const extractFirstJsonObject = (raw: string): string | null => {
  const start = raw.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < raw.length; i += 1) {
    const ch = raw[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inString) {
      escape = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === '{') depth += 1;
    if (ch === '}') {
      depth -= 1;
      if (depth === 0) return raw.slice(start, i + 1);
    }
  }
  return null;
};

const uniquePush = (arr: string[], value: string) => {
  if (!value) return;
  if (!arr.includes(value)) arr.push(value);
};

const summaryFromQuarterly = (obj: Record<string, unknown>) => {
  const lines: string[] = [];
  uniquePush(lines, asText(obj.executiveSummary));

  const highlights = toStrList(obj.keyHighlights);
  if (highlights.length) lines.push(`亮点：${highlights.join('；')}`);
  const concerns = toStrList(obj.keyConcerns);
  if (concerns.length) lines.push(`关注点：${concerns.join('；')}`);

  const reports = Array.isArray(obj.subjectReports) ? obj.subjectReports : [];
  for (const item of reports) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const subject = asText(it.subjectName);
    const summary = asText(it.summary);
    if (subject || summary) uniquePush(lines, `${subject || '科目'}：${summary || '暂无补充'}`);
  }

  const next = Array.isArray(obj.nextStageRecommendations) ? obj.nextStageRecommendations : [];
  if (next.length) {
    const parts: string[] = [];
    for (const n of next) {
      if (!n || typeof n !== 'object') continue;
      const r = n as Record<string, unknown>;
      const area = asText(r.area);
      const rec = asText(r.recommendation);
      const pri = asText(r.priority);
      const built = [area, rec, pri ? `优先级:${pri}` : ''].filter(Boolean).join(' - ');
      if (built) parts.push(built);
    }
    if (parts.length) lines.push(`下一阶段建议：${parts.join('；')}`);
  }

  if (obj.englishSpecialAnalysis && typeof obj.englishSpecialAnalysis === 'object') {
    const english = obj.englishSpecialAnalysis as Record<string, unknown>;
    const englishSummary = asText(english.summary);
    if (englishSummary) lines.push(`英文专项：${englishSummary}`);
    const teacherSuggestion = asText(english.teacherSuggestion);
    if (teacherSuggestion) lines.push(`英文专项建议：${teacherSuggestion}`);
  }

  uniquePush(lines, asText(obj.teacherComment));
  return lines.join('\n').trim();
};

const summaryFromYearly = (obj: Record<string, unknown>) => {
  const lines: string[] = [];
  uniquePush(lines, asText(obj.annualExecutiveSummary));
  const highlights = toStrList(obj.annualGrowthHighlights);
  if (highlights.length) lines.push(`年度成长亮点：${highlights.join('；')}`);
  const concerns = toStrList(obj.longTermConcerns);
  if (concerns.length) lines.push(`长期关注点：${concerns.join('；')}`);

  const reports = Array.isArray(obj.subjectReports) ? obj.subjectReports : [];
  for (const item of reports) {
    if (!item || typeof item !== 'object') continue;
    const it = item as Record<string, unknown>;
    const subject = asText(it.subjectName);
    const summary = asText(it.annualSummary);
    if (subject || summary) uniquePush(lines, `${subject || '科目'}：${summary || '暂无补充'}`);
  }

  const next = Array.isArray(obj.nextYearRecommendations) ? obj.nextYearRecommendations : [];
  if (next.length) {
    const parts: string[] = [];
    for (const n of next) {
      if (!n || typeof n !== 'object') continue;
      const r = n as Record<string, unknown>;
      const area = asText(r.area);
      const rec = asText(r.recommendation);
      const pri = asText(r.priority);
      const built = [area, rec, pri ? `优先级:${pri}` : ''].filter(Boolean).join(' - ');
      if (built) parts.push(built);
    }
    if (parts.length) lines.push(`下一年度建议：${parts.join('；')}`);
  }

  if (obj.englishSpecialAnalysis && typeof obj.englishSpecialAnalysis === 'object') {
    const english = obj.englishSpecialAnalysis as Record<string, unknown>;
    const englishSummary = asText(english.summary);
    if (englishSummary) lines.push(`英文专项：${englishSummary}`);
    const teacherSuggestion = asText(english.teacherSuggestion);
    if (teacherSuggestion) lines.push(`英文专项建议：${teacherSuggestion}`);
  }

  uniquePush(lines, asText(obj.teacherAnnualComment));
  return lines.join('\n').trim();
};

export const buildCompatibilitySummary = (
  reportType: StructuredReportType,
  structuredReport: Record<string, unknown> | null,
  rawText: string,
) => {
  if (structuredReport) {
    const built =
      reportType === 'quarterly'
        ? summaryFromQuarterly(structuredReport)
        : summaryFromYearly(structuredReport);
    if (built) return built;
  }
  const fallback = rawText.trim();
  return fallback || DEFAULT_EMPTY_SUMMARY;
};

export function parseAiStructuredReportResponse(
  raw: unknown,
  reportType: StructuredReportType,
): ParsedStructuredReportResult {
  const rawText = typeof raw === 'string' ? raw : String(raw ?? '');
  const candidates: string[] = [];
  const trimmed = rawText.trim();
  if (trimmed) candidates.push(trimmed);

  const unfenced = stripMarkdownFence(trimmed);
  if (unfenced && unfenced !== trimmed) candidates.push(unfenced);

  const extracted = extractFirstJsonObject(trimmed);
  if (extracted && !candidates.includes(extracted)) candidates.push(extracted);

  let lastError = 'No parsable JSON object found';
  for (const c of candidates) {
    try {
      const parsed = JSON.parse(c);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const structuredReport = parsed as Record<string, unknown>;
        const summaryText = buildCompatibilitySummary(reportType, structuredReport, rawText);
        return {
          structuredReport,
          summaryText: summaryText || DEFAULT_EMPTY_SUMMARY,
          rawAiResponse: rawText,
          parseError: null,
        };
      }
      lastError = 'Parsed JSON is not an object';
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
    }
  }

  return {
    structuredReport: null,
    summaryText: buildCompatibilitySummary(reportType, null, rawText),
    rawAiResponse: rawText,
    parseError: lastError,
  };
}

type CompactContextParams = {
  student: unknown;
  startDate: string;
  endDate: string;
  analytics: unknown;
  dailyProgress: unknown[];
  weeklyReports: unknown[];
  papers: unknown[];
  exams: unknown[];
  previousQuarterSummary?: unknown;
  quarterlySummaries?: unknown[];
  year?: number;
  reportType: StructuredReportType;
};

const sliceTail = <T>(arr: T[], max: number) => (arr.length > max ? arr.slice(arr.length - max) : arr);

const asRecord = (value: unknown): Record<string, unknown> => {
  if (value && typeof value === 'object') return value as Record<string, unknown>;
  return {};
};

const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const clip = (value: unknown, maxLen: number) => {
  const text = String(value ?? '').trim();
  if (!text) return '';
  if (text.length <= maxLen) return text;
  return `${text.slice(0, maxLen)}...`;
};

const normalizeSubjectKey = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[_-]/g, ' ')
    .replace(/\s+/g, ' ');

const parseScoreValue = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const slash = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(String(value).trim());
  if (slash) {
    const n = Number(slash[1]);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const formatScorePair = (score: unknown, total: unknown): string => {
  const s = parseScoreValue(score);
  const t = parseScoreValue(total);
  if (s === null) return '';
  if (t !== null && t > 0) return `${s}/${t}`;
  if (s >= 0 && s <= 100) return `${s}%`;
  return String(s);
};

const calcPercentage = (score: unknown, total: unknown): number | null => {
  const s = parseScoreValue(score);
  const t = parseScoreValue(total);
  if (s === null) return null;
  if (t !== null && t > 0) {
    return Math.round((s / t) * 1000) / 10;
  }
  if (s >= 0 && s <= 100) return Math.round(s * 10) / 10;
  return null;
};

const dedupeTextList = (value: unknown[], limit: number, maxLen: number): string[] => {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    const text = clip(item, maxLen);
    if (!text) continue;
    const key = normalizeSubjectKey(text);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
};

const buildSubjectContext = (input: CompactContextParams) => {
  type SubjectContextItem = {
    subjectName: string;
    dailyTaskHighlights: string[];
    strengths: string[];
    improvements: string[];
    paperRecords: Array<{
      date: unknown;
      title: string | null;
      score: string | null;
      percentage: number | null;
      strengths: string | null;
      improvements: string | null;
    }>;
    examRecords: Array<{
      date: unknown;
      examName: string | null;
      score: string | null;
      percentage: number | null;
      scope: string | null;
    }>;
    activityCount: number;
    activeDays: Set<string>;
  };

  const map = new Map<string, SubjectContextItem>();
  const touch = (nameRaw: unknown): SubjectContextItem | null => {
    const name = String(nameRaw ?? '').trim();
    if (!name) return null;
    const key = normalizeSubjectKey(name);
    if (!key) return null;
    const existing = map.get(key);
    if (existing) return existing;
    const created: SubjectContextItem = {
      subjectName: name,
      dailyTaskHighlights: [],
      strengths: [],
      improvements: [],
      paperRecords: [],
      examRecords: [],
      activityCount: 0,
      activeDays: new Set<string>(),
    };
    map.set(key, created);
    return created;
  };

  for (const dailyRow of asArray(input.dailyProgress)) {
    const d = asRecord(dailyRow);
    const date = String(d.date ?? '').slice(0, 10);
    for (const act of asArray(d.activities)) {
      const a = asRecord(act);
      const subject = touch(a.subjectDisplayName ?? a.subjectName ?? a.subject);
      if (!subject) continue;
      subject.activityCount += 1;
      if (date) subject.activeDays.add(date);
      const taskSummary = clip(a.taskSummary ?? a.practiceProgress ?? a.description, 120);
      if (taskSummary) subject.dailyTaskHighlights.push(taskSummary);
      const strengths = clip(a.strengths, 120);
      if (strengths) subject.strengths.push(strengths);
      const improvements = clip(a.improvements, 120);
      if (improvements) subject.improvements.push(improvements);
    }
  }

  for (const paperRow of asArray(input.papers)) {
    const p = asRecord(paperRow);
    const subject = touch(p.subjectName);
    if (!subject) continue;
    const score = formatScorePair(p.score, p.total);
    const percentage = calcPercentage(p.score, p.total);
    const strengths = clip(p.strengths, 100) || null;
    const improvements = clip(p.improvements, 100) || null;
    subject.paperRecords.push({
      date: p.date ?? null,
      title: clip(p.description, 120) || null,
      score: score || null,
      percentage,
      strengths,
      improvements,
    });
    if (strengths) subject.strengths.push(strengths);
    if (improvements) subject.improvements.push(improvements);
  }

  for (const examRow of asArray(input.exams)) {
    const e = asRecord(examRow);
    for (const examSubjectRow of asArray(e.subjects)) {
      const s = asRecord(examSubjectRow);
      const subject = touch(s.name);
      if (!subject) continue;
      const maxScore = s.maxScore ?? s.total ?? s.totalScore ?? null;
      const score = formatScorePair(s.score, maxScore);
      subject.examRecords.push({
        date: e.examDate ?? null,
        examName: clip(e.name, 120) || null,
        score: score || null,
        percentage: calcPercentage(s.score, maxScore),
        scope: clip(s.scope, 100) || null,
      });
    }
  }

  return Array.from(map.values()).map((item) => ({
    subjectName: item.subjectName,
    activityCount: item.activityCount,
    activeDays: item.activeDays.size,
    dailyTaskHighlights: dedupeTextList(item.dailyTaskHighlights, 6, 120),
    strengths: dedupeTextList(item.strengths, 6, 100),
    improvements: dedupeTextList(item.improvements, 6, 100),
    paperRecords: sliceTail(item.paperRecords, 8),
    examRecords: sliceTail(item.examRecords, 8),
  }));
};

const asSubjectSummaryText = (row: unknown): string => {
  const r = asRecord(row);
  const subjectName = String(r.subjectName ?? '').trim();
  const summary = String(r.summary ?? r.annualSummary ?? '').trim();
  if (!subjectName && !summary) return '';
  if (!subjectName) return summary;
  if (!summary) return `${subjectName}：暂无总结`;
  return `${subjectName}：${summary}`;
};

const buildReportHistoryContext = (value: unknown[]) =>
  asArray(value).map((row) => {
    const r = asRecord(row);
    const finalOrStructured = asRecord(r.finalReport ?? r.structuredReport);
    const subjectReports = asArray(finalOrStructured.subjectReports)
      .map((item) => asSubjectSummaryText(item))
      .filter(Boolean)
      .slice(0, 10);
    return {
      reportId: r.id ?? null,
      reportType: r.reportType ?? null,
      title: clip(r.title, 120) || null,
      startDate: r.startDate ?? null,
      endDate: r.endDate ?? null,
      year: r.year ?? null,
      updatedAt: r.updatedAt ?? null,
      summary: clip(r.summaryText ?? r.summary, 360) || null,
      subjectReports,
    };
  });

export function buildCompactReportContext(input: CompactContextParams) {
  const compactDaily = sliceTail(input.dailyProgress, input.reportType === 'yearly' ? 180 : 120).map((dailyRow) => {
    const d = asRecord(dailyRow);
    return {
      date: d.date ?? null,
      attendance: d.attendance ?? null,
      summary: d.summary ? String(d.summary).slice(0, 160) : null,
      activities: asArray(d.activities).slice(0, 12).map((activity) => {
        const a = asRecord(activity);
        const english = asRecord(a.english);
        const editing = asRecord(english.editing);
        const reading = asRecord(english.reading);
        const grammar = asRecord(english.grammar);
        return {
          subjectName: a.subjectDisplayName || a.subjectName || a.subject || null,
          taskSummary: clip(a.taskSummary || a.practiceProgress || a.description, 120) || null,
          strengths: clip(a.strengths, 120) || null,
          improvements: clip(a.improvements, 120) || null,
          english: a.type === 'english' || a.english
            ? {
                editing: {
                  score: editing.score ?? null,
                  totalScore: editing.totalScore ?? null,
                  scoreText: formatScorePair(editing.score, editing.totalScore),
                  percentage: calcPercentage(editing.score, editing.totalScore),
                  exerciseCount: editing.exerciseCount ?? 0,
                },
                reading: {
                  score: reading.score ?? null,
                  totalScore: reading.totalScore ?? null,
                  scoreText: formatScorePair(reading.score, reading.totalScore),
                  percentage: calcPercentage(reading.score, reading.totalScore),
                  articleCount: reading.articleCount ?? 0,
                },
                grammar: {
                  score: grammar.score ?? null,
                  totalScore: grammar.totalScore ?? null,
                  scoreText: formatScorePair(grammar.score, grammar.totalScore),
                  percentage: calcPercentage(grammar.score, grammar.totalScore),
                  exerciseCount: grammar.exerciseCount ?? 0,
                },
              }
            : undefined,
        };
      }),
    };
  });

  const compactWeekly = sliceTail(input.weeklyReports, input.reportType === 'yearly' ? 80 : 40).map((weeklyRow) => {
    const w = asRecord(weeklyRow);
    return {
      weekStarting: w.weekStarting ?? null,
      weekEnding: w.weekEnding ?? null,
      summary: w.summary ? String(w.summary).slice(0, 240) : null,
      strengths: asArray(w.strengths).slice(0, 6).map((item) => clip(item, 100)),
      areasToImprove: asArray(w.areasToImprove).slice(0, 6).map((item) => clip(item, 100)),
    };
  });

  const compactPapers = sliceTail(input.papers, input.reportType === 'yearly' ? 120 : 60).map((paperRow) => {
    const p = asRecord(paperRow);
    return {
      date: p.date ?? null,
      subjectName: p.subjectName ?? null,
      description: clip(p.description, 120) || null,
      score: p.score ?? null,
      total: p.total ?? null,
      strengths: p.strengths ? String(p.strengths).slice(0, 100) : null,
      improvements: p.improvements ? String(p.improvements).slice(0, 100) : null,
    };
  });

  const compactExams = sliceTail(input.exams, input.reportType === 'yearly' ? 80 : 40).map((examRow) => {
    const e = asRecord(examRow);
    return {
      name: e.name ?? null,
      examDate: e.examDate ?? null,
      subjects: asArray(e.subjects).slice(0, 12).map((subjectRow) => {
        const s = asRecord(subjectRow);
        return {
          name: s.name ?? null,
          score: s.score ?? null,
          maxScore: s.maxScore ?? s.total ?? s.totalScore ?? null,
          scope: clip(s.scope, 120) || null,
        };
      }),
    };
  });
  const subjectContext = buildSubjectContext(input);
  const previousQuarterContext =
    input.reportType === 'quarterly'
      ? buildReportHistoryContext([input.previousQuarterSummary]).filter((item) => item.reportId || item.summary)[0] || null
      : null;
  const quarterlySummariesInYear =
    input.reportType === 'yearly'
      ? sliceTail(buildReportHistoryContext(input.quarterlySummaries || []), 8)
      : [];

  return {
    student: input.student,
    startDate: input.startDate,
    endDate: input.endDate,
    ...(typeof input.year === 'number' ? { year: input.year } : {}),
    dailyProgress: compactDaily,
    weeklyReports: compactWeekly,
    papers: compactPapers,
    exams: compactExams,
    ...(input.reportType === 'quarterly'
      ? { previousQuarterContext }
      : { quarterlySummariesInYear }),
    subjectContext,
    analytics: input.analytics,
    contextMeta: {
      dailyRowsOriginal: Array.isArray(input.dailyProgress) ? input.dailyProgress.length : 0,
      weeklyRowsOriginal: Array.isArray(input.weeklyReports) ? input.weeklyReports.length : 0,
      papersOriginal: Array.isArray(input.papers) ? input.papers.length : 0,
      examsOriginal: Array.isArray(input.exams) ? input.exams.length : 0,
      dailyRowsUsed: compactDaily.length,
      weeklyRowsUsed: compactWeekly.length,
      papersUsed: compactPapers.length,
      examsUsed: compactExams.length,
    },
  };
}
