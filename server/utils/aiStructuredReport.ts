export type StructuredReportType = 'quarterly' | 'yearly';

export type ParsedStructuredReportResult = {
  structuredReport: Record<string, unknown> | null;
  summaryText: string;
  rawAiResponse: string;
  parseError: string | null;
};

const DEFAULT_EMPTY_SUMMARY = '当前AI未返回有效报告内容，请稍后重试。';

export const DEEPSEEK_QUARTERLY_PROMPT = `你是一名负责向家长汇报学习情况的一线老师。你不是数据分析器，系统已经给你提供了 analytics，请优先依据 analytics 写报告。

硬性要求：
1) 必须优先使用 analytics 作为事实来源，raw dailyProgress/weeklyReports/papers/exams 只作为补充证据。
2) 不得编造 analytics 中不存在的数据、趋势、成绩、考试、试卷、优点或问题。
3) 不要说“明显进步”，除非该科目 trend=improving 或 improvement>0。
4) 不要说“退步”，除非该科目 trend=declining。
5) trend=insufficient_data 时，必须表达“目前成绩数据有限，暂时不宜判断长期趋势”。
6) 某科无成绩但有日常记录：可评价学习投入与完成情况，但不要评价成绩趋势。
7) 某科有成绩但日常记录很少：需提示“练习记录较少，难以全面判断日常学习过程”。
8) dataQualityNotesForTeacher 必须参考 analytics.aiGuidance.dataQualityNotes。
9) 输出必须是单个 valid JSON object，不要 markdown 代码块，不要 JSON 外文字。
10) 中文输出，语气亲切、专业、具体，适合老师写给家长看。
11) subjectReports 必须基于 analytics.subjectStats 的科目。若 analytics.subjectStats 为空，subjectReports 返回 []，并在总结说明数据不足。
12) priority 只能是 high/medium/low。
13) 如 analytics.englishAnalytics.hasEnglishData=true，必须输出 englishSpecialAnalysis，且仅依据 englishAnalytics，不得编造 editing/composition/reading/grammar 次数或分数。
14) 若 englishAnalytics 某 skill 的 scoreRecordCount=0，只能评价练习投入，不可评价分数趋势。
15) 若 englishAnalytics.vocabularyStats.vocabularyItemsCount 为 null，只能写“有词汇练习记录”，不要写具体数量。

请严格按以下结构输出：
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

export const DEEPSEEK_YEARLY_PROMPT = `你是一名负责向家长汇报学习情况的一线老师。你不是数据分析器，系统已经给你提供了 analytics，请优先依据 analytics 写年度报告。

硬性要求：
1) 必须优先使用 analytics 作为事实来源，raw dailyProgress/weeklyReports/papers/exams 只作为补充证据。
2) 不得编造 analytics 中不存在的数据、趋势、成绩、考试、试卷、优点或问题。
3) 不要说“明显进步”，除非该科目 trend=improving 或 improvement>0。
4) 不要说“退步”，除非该科目 trend=declining。
5) trend=insufficient_data 时，必须表达“目前成绩数据有限，暂时不宜判断长期趋势”。
6) 某科无成绩但有日常记录：可评价学习投入与完成情况，但不要评价成绩趋势。
7) 某科有成绩但日常记录很少：需提示“练习记录较少，难以全面判断日常学习过程”。
8) dataQualityNotesForTeacher 必须参考 analytics.aiGuidance.dataQualityNotes。
9) 输出必须是单个 valid JSON object，不要 markdown 代码块，不要 JSON 外文字。
10) 中文输出，语气亲切、专业、具体，适合老师写给家长看。
11) subjectReports 必须基于 analytics.subjectStats 的科目。若 analytics.subjectStats 为空，subjectReports 返回 []，并在总结说明数据不足。
12) priority 只能是 high/medium/low。
13) 如 analytics.englishAnalytics.hasEnglishData=true，必须输出 englishSpecialAnalysis，且仅依据 englishAnalytics，不得编造 editing/composition/reading/grammar 次数或分数。
14) 若 englishAnalytics 某 skill 的 scoreRecordCount=0，只能评价练习投入，不可评价分数趋势。
15) 若 englishAnalytics.vocabularyStats.vocabularyItemsCount 为 null，只能写“有词汇练习记录”，不要写具体数量。

请严格按以下结构输出：
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
                editing: { score: editing.score ?? null, exerciseCount: editing.exerciseCount ?? 0 },
                reading: { score: reading.score ?? null, articleCount: reading.articleCount ?? 0 },
                grammar: { score: grammar.score ?? null, exerciseCount: grammar.exerciseCount ?? 0 },
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
      ? { previousQuarterSummary: input.previousQuarterSummary ?? null }
      : { quarterlySummaries: sliceTail(input.quarterlySummaries || [], 8) }),
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
