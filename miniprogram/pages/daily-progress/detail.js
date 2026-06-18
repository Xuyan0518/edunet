const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDate, formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
const { showActionLockToast } = require("../../utils/actionLock");
const { LIMITS, trimText, clampIntInput } = require("../../utils/validation");
const {
  DEFAULT_ENGLISH_TASKS,
  normalizeEnglishTaskConfig,
  getCanonicalTaskKeys,
} = require("../../utils/englishTasks");
const {
  makeDailyProgressDraftKey,
  buildDailyProgressDraftPayload,
} = require("../../utils/dailyProgressDraft");

const attendanceMap = [
  { value: "present", label: "出席" },
  { value: "late", label: "迟到" },
  { value: "absent", label: "缺席" },
];

const topicStatusLabel = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
};

const topicStatusClass = {
  not_started: "chip-muted",
  in_progress: "chip-warning",
  completed: "chip-success",
};

const deriveTopicStatus = (definitionRecited, chapterExerciseCompleted) => {
  if (definitionRecited && chapterExerciseCompleted) return "completed";
  if (definitionRecited || chapterExerciseCompleted) return "in_progress";
  return "not_started";
};

const decorateTopic = (topic) => {
  const definitionRecited = !!topic.definitionRecited;
  const chapterExerciseCompleted = !!topic.chapterExerciseCompleted;
  const status = deriveTopicStatus(definitionRecited, chapterExerciseCompleted);
  return {
    id: topic.id,
    code: topic.code || "",
    title: topic.title || "",
    displayTitle: topic.displayTitle || topic.title || "",
    definitionRecited,
    chapterExerciseCompleted,
    status,
    statusLabel: topicStatusLabel[status] || status,
    statusClass: topicStatusClass[status] || "chip-muted",
    children: (topic.children || []).map(decorateTopic),
  };
};

const countTopics = (topics) =>
  (topics || []).reduce((sum, t) => sum + 1 + countTopics(t.children || []), 0);

// V2 English fields. Each scored sub-skill (editing/reading/grammar) carries
// score/totalScore/count + lossPointIds/lossPointLabelsSnapshot/otherLossPointText.
// Vocab carries a sentence-count, recitation is text-only, essay carries
// title/completed/score. Server-side validation requires loss points whenever
// editing/reading/grammar has a numeric score (Part 4).

const toLegacyText = (v) => {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object" && typeof v.text === "string") return v.text;
  return "";
};

const toIntOrZero = (v) => {
  if (typeof v === "number" && isFinite(v) && v >= 0) return Math.floor(v);
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    if (isFinite(n) && n >= 0) return Math.floor(n);
  }
  return 0;
};

const toScoreOrNull = (v) => {
  if (v === "" || v == null) return null;
  if (typeof v === "number" && isFinite(v)) return v;
  const n = Number(v);
  return isFinite(n) ? n : null;
};

const toBoundedScore = (v) => {
  const n = toScoreOrNull(v);
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > LIMITS.englishScoreMax) return null;
  return n;
};

const toBoundedTotalScore = (v) => {
  const n = toScoreOrNull(v);
  if (n == null) return null;
  if (!Number.isFinite(n)) return null;
  if (n <= 0 || n > LIMITS.englishScoreMax) return null;
  return n;
};

const getEffectiveTotal = (score, totalScore, fallbackTotal = 100) => {
  const total = toBoundedTotalScore(totalScore);
  if (total != null) return total;
  if (score == null) return null;
  const fallback = toBoundedTotalScore(fallbackTotal);
  return fallback != null ? fallback : 100;
};

const isImperfectScore = (score, totalScore, fallbackTotal = 100) => {
  const s = toBoundedScore(score);
  if (s == null) return false;
  const total = getEffectiveTotal(s, totalScore, fallbackTotal);
  if (total == null) return false;
  return s < total;
};

const defaultFieldFor = (kind) => {
  if (kind === "editing" || kind === "grammar") {
    return {
      text: "",
      score: null,
      totalScore: 100,
      exerciseCount: 0,
      exercises: [],
      lossPointIds: [],
      lossPointLabelsSnapshot: [],
      otherLossPointText: "",
    };
  }
  if (kind === "reading") {
    return {
      text: "",
      score: null,
      totalScore: 100,
      articleCount: 0,
      exercises: [],
      lossPointIds: [],
      lossPointLabelsSnapshot: [],
      otherLossPointText: "",
    };
  }
  if (kind === "vocab") return { text: "", vocabularySentenceCount: 0, vocabularyWordCount: 0 };
  if (kind === "recitation") return { text: "" };
  if (kind === "essay") {
    return {
      text: "",
      title: "",
      completed: false,
      score: null,
      totalScore: null,
      lossPointIds: [],
      lossPointLabelsSnapshot: [],
      otherLossPointText: "",
    };
  }
  return { text: "" };
};

const toV2Field = (raw, kind) => {
  const def = defaultFieldFor(kind);
  if (raw == null) return def;
  if (typeof raw === "string") return { ...def, text: raw };
  if (typeof raw !== "object") return def;
  const out = { ...def, ...raw };
  out.text = toLegacyText(raw);
  if ("lossPointIds" in def) {
    out.lossPointIds = Array.isArray(raw.lossPointIds) ? raw.lossPointIds.slice() : [];
    out.lossPointLabelsSnapshot = Array.isArray(raw.lossPointLabelsSnapshot)
      ? raw.lossPointLabelsSnapshot.slice()
      : [];
    out.otherLossPointText = typeof raw.otherLossPointText === "string" ? raw.otherLossPointText : "";
  }
  if ("score" in def) out.score = toScoreOrNull(raw.score);
  if ("totalScore" in def) {
    const ts = toScoreOrNull(raw.totalScore);
    out.totalScore = ts == null ? def.totalScore : ts;
  }
  if (kind === "editing" || kind === "grammar") out.exerciseCount = toIntOrZero(raw.exerciseCount);
  if (kind === "reading") out.articleCount = toIntOrZero(raw.articleCount);
  if (kind === "vocab") {
    out.vocabularySentenceCount = toIntOrZero(raw.vocabularySentenceCount);
    out.vocabularyWordCount = toIntOrZero(raw.vocabularyWordCount);
  }
  if (kind === "editing" || kind === "grammar" || kind === "reading") {
    const count = kind === "reading" ? out.articleCount : out.exerciseCount;
    out.exercises = buildExercisesArray(raw.exercises, count, out.score, out.text);
  }
  if (kind === "essay") out.completed = raw.completed === true;
  if (kind === "essay") out.title = typeof raw.title === "string" ? raw.title : "";
  return out;
};

const computeSectionSummary = (code, block) => {
  const exercisesScored = (Array.isArray(block.exercises) ? block.exercises : []).filter((ex) => ex.isScored);
  const avgPct = (list, fallbackTotal) => {
    if (!list.length) return null;
    const percentages = list
      .map((ex) => {
        const score = toScoreOrNull(ex.score);
        const total = getEffectiveTotal(score, ex.totalScore, fallbackTotal);
        if (score == null || total == null || total <= 0) return null;
        return (score / total) * 100;
      })
      .filter((n) => n != null);
    if (!percentages.length) return null;
    return Math.round(percentages.reduce((s, n) => s + Number(n), 0) / percentages.length);
  };
  if (code === "editing" || code === "grammar") {
    const count = block.exerciseCount || 0;
    if (count === 0) return "未练习";
    const a = avgPct(exercisesScored, block.totalScore || 100);
    return a == null ? `${count} 练习` : `${count} 练习 · 平均 ${a}%`;
  }
  if (code === "reading") {
    const count = block.articleCount || 0;
    if (count === 0) return "未练习";
    const a = avgPct(exercisesScored, block.totalScore || 100);
    return a == null ? `${count} 篇` : `${count} 篇 · 平均 ${a}%`;
  }
  if (code === "vocab") {
    const w = block.vocabularyWordCount || 0;
    const s = block.vocabularySentenceCount || 0;
    if (!w && !s) return "未练习";
    return `单词 ${w} · 句子 ${s}`;
  }
  if (code === "recitation") {
    const t = (block.text || "").trim();
    if (!t) return "未练习";
    return t.length > 12 ? t.slice(0, 12) + "…" : t;
  }
  if (code === "essay") {
    const title = (block.title || "").trim();
    const text = (block.text || "").trim();
    const score = block.score;
    const completed = block.completed === true;
    if (!title && !text && score == null && !completed) return "未练习";
    const titleStr = title || "无题";
    return completed ? `已完成 · ${titleStr}` : `未完成 · ${titleStr}`;
  }
  return "";
};

const computeSectionHasData = (code, block) => {
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  if (code === "editing" || code === "grammar") {
    return (block.exerciseCount || 0) > 0 || exercises.some((ex) => ex.isScored) || (block.text || "").trim().length > 0;
  }
  if (code === "reading") {
    return (block.articleCount || 0) > 0 || exercises.some((ex) => ex.isScored) || (block.text || "").trim().length > 0;
  }
  if (code === "vocab") {
    return (block.vocabularyWordCount || 0) > 0 || (block.vocabularySentenceCount || 0) > 0;
  }
  if (code === "recitation") {
    return (block.text || "").trim().length > 0;
  }
  if (code === "essay") {
    return Boolean(
      (block.title || "").trim() ||
      (block.text || "").trim() ||
      block.score != null ||
      block.completed === true
    );
  }
  return false;
};

const buildExercisesArray = (raw, count, legacyScore, legacyText, legacyTotalScore = 100) => {
  const incoming = Array.isArray(raw) ? raw : [];
  const out = [];
  for (let i = 0; i < count; i++) {
    const e = incoming[i];
    if (e && typeof e === "object" && !Array.isArray(e)) {
      out.push({
        score: toScoreOrNull(e.score),
        totalScore: toScoreOrNull(e.totalScore ?? e.maxScore),
        problems: typeof e.problems === "string" ? e.problems : "",
      });
    } else {
      out.push({
        score: i === 0 && incoming.length === 0 ? legacyScore : null,
        totalScore: i === 0 && incoming.length === 0
          ? (toBoundedTotalScore(legacyTotalScore) || 100)
          : 100,
        problems: i === 0 && incoming.length === 0 ? (legacyText || "") : "",
      });
    }
  }
  return out;
};

const buildEnglishFields = (input = {}) => ({
  editing: toV2Field(input.editing, "editing"),
  reading: toV2Field(input.reading, "reading"),
  grammar: toV2Field(input.grammar, "grammar"),
  vocab: toV2Field(input.vocab || input.vocabulary, "vocab"),
  recitation: toV2Field(input.recitation || input.memory, "recitation"),
  essay: toV2Field(input.essay, "essay"),
});

const canonicalEnglishTaskKeys = getCanonicalTaskKeys();

const makeDraftKey = ({ studentId, date, userId }) =>
  makeDailyProgressDraftKey({ studentId, date, userId });

const normalizeCustomEnglishTasks = (raw) => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((row, index) => {
      if (!row || typeof row !== "object") return null;
      const task = row;
      const key = String(task.key || "").trim().toLowerCase() || `custom_${index + 1}`;
      const id = String(task.taskId || task.id || key || `task_${index + 1}`).trim();
      const displayName = String(task.displayName || task.chineseName || task.englishName || key).trim();
      if (!displayName) return null;
      const fieldsUsed = Array.isArray(task.fieldsUsed)
        ? task.fieldsUsed.filter((f) => ["practiceCount", "score", "problems"].includes(f))
        : ["practiceCount", "score", "problems"];
      const practiceCount = toIntOrZero(task.practiceCount);
      const score = toScoreOrNull(task.score);
      const maxScore = toScoreOrNull(task.maxScore);
      const problems = String(task.problems || "").trim();
      return {
        taskId: id,
        key,
        displayName,
        chineseName: String(task.chineseName || "").trim(),
        englishName: String(task.englishName || "").trim(),
        practiceCount,
        score,
        maxScore,
        problems,
        exercises: buildExercisesArray(task.exercises, practiceCount, score, problems, maxScore || 100),
        completed: task.completed === true,
        targetCount: toIntOrZero(task.targetCount),
        fieldsUsed: fieldsUsed.length ? fieldsUsed : ["practiceCount", "score", "problems"],
      };
    })
    .filter(Boolean);
};

const summarizeEnglishProblems = (block = {}) => {
  const exercises = Array.isArray(block.exercises) ? block.exercises : [];
  const collected = exercises
    .map((ex) => String(ex?.problems || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return collected.join("；");
};

const summarizeTaskExerciseProblems = (exercises = []) => {
  const collected = (Array.isArray(exercises) ? exercises : [])
    .map((ex) => String(ex?.problems || "").trim())
    .filter(Boolean)
    .slice(0, 3);
  return collected.join("；");
};

const canonicalTaskSnapshot = (key, block = {}, meta = {}) => {
  let practiceCount = 0;
  let score = null;
  let problems = "";
  let completed = false;
  if (key === "editing" || key === "grammar") {
    practiceCount = toIntOrZero(block.exerciseCount);
    score = toScoreOrNull(block.score);
    problems = summarizeEnglishProblems(block);
    completed = practiceCount > 0;
  } else if (key === "reading") {
    practiceCount = toIntOrZero(block.articleCount);
    score = toScoreOrNull(block.score);
    problems = summarizeEnglishProblems(block);
    completed = practiceCount > 0;
  } else if (key === "vocab") {
    practiceCount = toIntOrZero(block.vocabularyWordCount) + toIntOrZero(block.vocabularySentenceCount);
    completed = practiceCount > 0;
  } else if (key === "recitation") {
    practiceCount = trimText(block.text).length > 0 ? 1 : 0;
    problems = trimText(block.text);
    completed = practiceCount > 0;
  } else if (key === "essay") {
    practiceCount = block.completed ? 1 : 0;
    score = toScoreOrNull(block.score);
    problems = trimText(block.text);
    completed = block.completed === true;
  }
  return {
    taskId: meta.id || key,
    key: meta.key || key,
    displayName: meta.displayName || key,
    chineseName: meta.chineseName || "",
    englishName: meta.englishName || "",
    practiceCount,
    score,
    maxScore: toScoreOrNull(block.totalScore),
    problems,
    completed,
    targetCount: toIntOrZero(meta.weeklyTargetCount),
    fieldsUsed: Array.isArray(meta.enabledFields) ? meta.enabledFields : ["practiceCount", "score", "problems"],
  };
};

const normalizeEnglishTaskEntryForUi = (entry = {}, configTask = {}) => {
  const enabledFields = Array.isArray(configTask.enabledFields)
    ? configTask.enabledFields
    : (Array.isArray(entry.fieldsUsed) ? entry.fieldsUsed : ["practiceCount", "score", "problems"]);
  return {
    taskId: entry.taskId || configTask.id || configTask.key || "",
    key: entry.key || configTask.key || "",
    displayName: configTask.displayName || entry.displayName || configTask.key || "",
    chineseName: configTask.chineseName || entry.chineseName || "",
    englishName: configTask.englishName || entry.englishName || "",
    practiceCount: toIntOrZero(entry.practiceCount),
    score: toScoreOrNull(entry.score),
    maxScore: toScoreOrNull(entry.maxScore),
    problems: trimText(entry.problems || ""),
    exercises: buildExercisesArray(
      entry.exercises,
      toIntOrZero(entry.practiceCount),
      toScoreOrNull(entry.score),
      trimText(entry.problems || ""),
      toScoreOrNull(entry.maxScore) || 100
    ),
    completed: entry.completed === true,
    targetCount: toIntOrZero(configTask.weeklyTargetCount || entry.targetCount),
    fieldsUsed: enabledFields,
    uiExpanded: entry.uiExpanded === true,
  };
};

const isEnglishSubject = (subject = {}) => {
  const name = String(subject.name || subject.subjectName || subject.subject || "").toLowerCase();
  const code = String(subject.code || subject.subjectCode || "").toLowerCase();
  return (
    name.includes("english") ||
    name.includes("英文") ||
    name.includes("英语") ||
    code.includes("eng")
  );
};

const buildEnglishActivity = (input = {}) => ({
  subjectId: input.subjectId || "",
  subjectName: input.subjectName || "英文",
  subjectDisplayName: formatSubjectName(input.subjectName || "英文"),
  type: "english",
  english: buildEnglishFields(input),
  englishTasks: normalizeCustomEnglishTasks(input.englishTasks),
  taskSummary: input.taskSummary || input.practiceProgress || input.description || "",
  strengths: input.strengths || "",
  improvements: input.improvements || "",
  comment: input.comment || "",
  papers: input.papers || [],
  locked: true,
});

const normalizeActivity = (activity = {}) => {
  const subjectName = activity.subjectName || activity.subject || "";
  const subjectId = activity.subjectId || "";
  const english = activity.english || activity.englishFields || {};
  const isEnglish =
    activity.type === "english" ||
    Object.keys(english).length > 0 ||
    String(subjectName || "").toLowerCase() === "english" ||
    String(subjectName || "").includes("英文") ||
    String(subjectName || "").includes("英语");
  if (isEnglish) {
    return {
      subjectId,
      subjectName: subjectName || "英文",
      subjectDisplayName: formatSubjectName(subjectName || "英文"),
      type: "english",
      english: buildEnglishFields({ ...english, ...activity }),
      englishTasks: normalizeCustomEnglishTasks(activity.customEnglishTasks || activity.englishTasks),
      taskSummary: activity.taskSummary || activity.practiceProgress || activity.description || "",
      strengths: activity.strengths || "",
      improvements: activity.improvements || "",
      comment: activity.comment || "",
      papers: activity.papers || [],
      locked: true,
    };
  }
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    taskSummary: activity.taskSummary || activity.practiceProgress || activity.description || "",
    practiceProgress: activity.practiceProgress || activity.description || "",
    definitionRecitation: activity.definitionRecitation || activity.notes || "",
    strengths: activity.strengths || "",
    improvements: activity.improvements || "",
    comment: activity.comment || "",
    papers: activity.papers || [],
  };
};

const buildPaperEntry = (input = {}) => ({
  id: input.id || "",
  typeId: input.typeId || "",
  schoolId: input.schoolId || "",
  description: input.description || "",
  strengths: input.strengths || "",
  improvements: input.improvements || "",
  score: input.score ?? "",
  total: input.total ?? "",
  typeIndex: input.typeIndex ?? 0,
  schoolIndex: input.schoolIndex ?? 0,
});

const ensureEnglishActivity = (activities = []) => {
  const idx = activities.findIndex((a) => a.type === "english");
  if (idx >= 0) {
    const next = [...activities];
    next[idx] = { ...buildEnglishActivity(next[idx]?.english || {}), ...next[idx], locked: true };
    return next;
  }
  return [buildEnglishActivity(), ...activities];
};

const buildActivityForSubject = (subject) => {
  const subjectName = subject?.name || subject?.subjectName || "";
  const subjectId = subject?.id || "";
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    taskSummary: "",
    practiceProgress: "",
    definitionRecitation: "",
    strengths: "",
    improvements: "",
    comment: "",
    papers: [],
  };
};

Page({
  data: {
    student: {},
    selectedDate: "",
    attendance: "present",
    attendanceLabel: "出席",
    attendanceOptions: attendanceMap.map((a) => a.label),
    attendanceStart: "18:00",
    attendanceEnd: "21:00",
    studySettingsEnabled: true,
    studyDays: [0, 1, 2, 3, 4],
    studyStartFallback: "18:00",
    studyEndFallback: "21:00",
    summary: "",
    subjects: [],
    subjectOptions: [],
    activities: [buildEnglishActivity()],
    paperTypes: [],
    paperTypeOptions: ["请选择类型"],
    paperSchools: [],
    paperSchoolOptions: ["请选择学校"],
    existingId: null,
    editingId: null,
    isTeacher: false,
    isEditing: false,
    isEditable: false,
    backup: null,
    lastUpdatedAt: "",
    lastUpdatedBy: "",
    lastUpdatedAtText: "",
    papersUpdatedAt: "",
    papersUpdatedBy: "",
    papersUpdatedAtText: "",
    lossPointCatalog: { editing: [], reading: [], grammar: [], essay: [] },
    topicProgressSubjects: [],
    topicProgressExpandedSubjects: {},
    topicProgressExpandedTopics: {},
    englishTaskConfig: DEFAULT_ENGLISH_TASKS,
    englishTaskIsDefault: true,
    hasDraft: false,
    draftUpdatedAtText: "",
    draftStorageKey: "",
    publishing: false,
    draftSaving: false,
    canManageEnglishTasks: false,
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    const isTeacher = user?.role === "teacher" || user?.role === "admin";
    const isManager = user?.role === "teacher" || user?.role === "admin";
    this.currentUser = user || {};
    this.studentId = query.studentId;
    const date = query.date || this.today();

    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "error" });
      wx.navigateBack();
      return;
    }

    this.setData({
      isTeacher,
      selectedDate: date,
      isEditing: !query.date && isTeacher,
      isEditable: !query.date && isTeacher,
      draftStorageKey: makeDraftKey({
        studentId: this.studentId,
        date,
        userId: this.currentUser?.id || "",
      }),
      canManageEnglishTasks: isManager,
    });

    this.fetchEnglishTaskConfig();
    this.fetchStudent();
    this.fetchSubjects();
    this.fetchPaperTypes();
    this.fetchPaperSchools();
    this.fetchLossPointCatalog();
    this.fetchTopicProgress();
    this.fetchStudySettings().finally(() => this.fetchProgress());
  },

  onShow() {
    if (!this.studentId) return;
    if (this.shouldRefreshEnglishTaskConfig) {
      this.shouldRefreshEnglishTaskConfig = false;
      this.fetchEnglishTaskConfig();
    }
  },

  fetchLossPointCatalog() {
    request({ url: "/loss-points" })
      .then((data) => {
        const catalog = { editing: [], reading: [], grammar: [], essay: [] };
        (data?.categories || []).forEach((cat) => {
          if (cat.code in catalog) {
            catalog[cat.code] = (cat.points || []).map((p) => ({ id: p.id, label: p.label }));
          }
        });
        this.setData({ lossPointCatalog: catalog }, () => this.refreshActivityChips());
      })
      .catch(() => {
        // Catalog is optional for legacy/non-scored editing; ignore failures.
      });
  },

  fetchEnglishTaskConfig() {
    if (!this.studentId) return;
    request({ url: `/students/${this.studentId}/english-tasks` })
      .then((data) => {
        const config = normalizeEnglishTaskConfig(data?.tasks || DEFAULT_ENGLISH_TASKS);
        this.setData(
          {
            englishTaskConfig: config,
            englishTaskIsDefault: !!data?.isDefault,
          },
          () => this.refreshActivityChips()
        );
      })
      .catch(() => {
        this.setData({ englishTaskConfig: DEFAULT_ENGLISH_TASKS, englishTaskIsDefault: true }, () =>
          this.refreshActivityChips()
        );
      });
  },

  fetchStudySettings() {
    return request({ url: "/study-settings" })
      .then((settings) => {
        this.setData({
          studySettingsEnabled: settings?.enabled !== false,
          studyDays: Array.isArray(settings?.days) ? settings.days : [0, 1, 2, 3, 4],
          studyStartFallback: settings?.startTime || "18:00",
          studyEndFallback: settings?.endTime || "21:00",
        });
      })
      .catch(() => {
        this.setData({
          studySettingsEnabled: true,
          studyDays: [0, 1, 2, 3, 4],
          studyStartFallback: "18:00",
          studyEndFallback: "21:00",
        });
      });
  },

  isConfiguredStudyDay(dateText) {
    if (!dateText) return true;
    const days = Array.isArray(this.data.studyDays) ? this.data.studyDays : [0, 1, 2, 3, 4];
    const date = new Date(`${dateText}T00:00:00`);
    if (Number.isNaN(date.getTime())) return true;
    return days.includes(date.getDay());
  },

  getStudyAttendanceDefaults(dateText = this.data.selectedDate) {
    if (this.data.studySettingsEnabled === false || !this.isConfiguredStudyDay(dateText)) {
      return { attendanceStart: "", attendanceEnd: "" };
    }
    return {
      attendanceStart: this.data.studyStartFallback || "18:00",
      attendanceEnd: this.data.studyEndFallback || "21:00",
    };
  },

  openEnglishTaskManage() {
    if (!this.data.canManageEnglishTasks || !this.studentId) return;
    this.shouldRefreshEnglishTaskConfig = true;
    wx.navigateTo({ url: `/pages/english-tasks-manage/index?studentId=${this.studentId}` });
  },

  // Recompute chip selections on every activities update so WXML can render
  // them declaratively (WeChat WXML can't filter inside templates).
  decorateActivities(activities) {
    const catalog = this.data.lossPointCatalog || {};
    const taskConfig = normalizeEnglishTaskConfig(this.data.englishTaskConfig || DEFAULT_ENGLISH_TASKS);
    const taskMap = new Map(taskConfig.map((task) => [task.key, task]));
    const customConfig = taskConfig.filter((task) => !canonicalEnglishTaskKeys.includes(task.key) && task.enabled !== false);
    const sections = ["editing", "reading", "grammar", "vocab", "recitation", "essay"];
    return (activities || []).map((a) => {
      if (!a || a.type !== "english" || !a.english) return a;
      const eng = { ...a.english };
      sections.forEach((code) => {
        const block = eng[code] || {};
        const configTask = taskMap.get(code) || taskMap.get(code === "vocab" ? "vocabulary" : code) || null;
        let decorated = { ...block };

        if (code === "editing" || code === "reading" || code === "grammar") {
          const ids = Array.isArray(block.lossPointIds) ? block.lossPointIds : [];
          const fallbackTotal = toBoundedTotalScore(block.totalScore) || 100;
          const exercises = (Array.isArray(block.exercises) ? block.exercises : []).map((ex) => {
            const n = ex.score == null || ex.score === "" ? null : Number(ex.score);
            const isScored = n !== null && Number.isFinite(n);
            const exTotal = getEffectiveTotal(n, ex.totalScore, fallbackTotal);
            return {
              ...ex,
              totalScore: exTotal,
              showProblems: isScored && isImperfectScore(n, exTotal, fallbackTotal),
              isScored,
            };
          });
          decorated = {
            ...decorated,
            exercises,
            anyImperfect: exercises.some((ex) => ex.showProblems),
            chips: (catalog[code] || []).map((p) => ({
              id: p.id,
              label: p.label,
              selected: ids.indexOf(p.id) >= 0,
            })),
          };
        }
        if (code === "essay") {
          const score = toScoreOrNull(decorated.score);
          const total = toScoreOrNull(decorated.totalScore);
          decorated.showProblems = isImperfectScore(score, total, 100);
        }

        decorated.uiSummary = computeSectionSummary(code, decorated);
        decorated.uiHasData = computeSectionHasData(code, decorated);
        // Auto-expand sections that already have data when the page first
        // renders. Once the user toggles, the explicit value sticks.
        decorated.uiExpanded = block.uiExpanded === undefined ? decorated.uiHasData : block.uiExpanded;
        decorated.uiEnabled = configTask ? configTask.enabled !== false : true;
        decorated.uiLabel = configTask?.displayName || block.uiLabel || "";
        decorated.uiFieldsUsed = Array.isArray(configTask?.enabledFields)
          ? configTask.enabledFields
          : ["practiceCount", "score", "problems"];
        decorated.uiTargetCount = toIntOrZero(configTask?.weeklyTargetCount);
        eng[code] = decorated;
      });
      const rawCustomTasks = Array.isArray(a.customEnglishTasks) && a.customEnglishTasks.length
        ? a.customEnglishTasks
        : a.englishTasks;
      const customByKey = new Map();
      normalizeCustomEnglishTasks(rawCustomTasks).forEach((entry) => {
        customByKey.set(entry.key, entry);
      });
      const expandedByKey = new Map();
      (Array.isArray(rawCustomTasks) ? rawCustomTasks : []).forEach((row) => {
        if (!row || typeof row !== "object") return;
        const key = String(row.key || "").trim().toLowerCase();
        if (!key) return;
        expandedByKey.set(key, row.uiExpanded === true);
      });
      const customEnglishTasks = customConfig.map((task) => {
        const current = customByKey.get(task.key) || {};
        const normalized = normalizeEnglishTaskEntryForUi(current, task);
        if (expandedByKey.has(task.key)) normalized.uiExpanded = expandedByKey.get(task.key);
        const fallbackTotal = toBoundedTotalScore(normalized.maxScore) || 100;
        const exercises = (Array.isArray(normalized.exercises) ? normalized.exercises : []).map((ex) => {
          const n = ex.score == null || ex.score === "" ? null : Number(ex.score);
          const isScored = n !== null && Number.isFinite(n);
          const exTotal = getEffectiveTotal(n, ex.totalScore, fallbackTotal);
          return {
            ...ex,
            totalScore: exTotal,
            showProblems: isScored && isImperfectScore(n, exTotal, fallbackTotal),
            isScored,
          };
        });
        normalized.exercises = exercises;
        normalized.anyImperfect = exercises.some((ex) => ex.showProblems);
        return normalized;
      });
      return { ...a, english: eng, customEnglishTasks };
    });
  },

  toggleEnglishSection(e) {
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    const a = this.data.activities[idx];
    const block = a?.english?.[sub] || {};
    this.updateEnglishBlock(idx, sub, { uiExpanded: !block.uiExpanded });
  },

  refreshActivityChips() {
    this.setData({ activities: this.decorateActivities(this.data.activities) });
  },

  today() {
    return formatChinaDate(new Date());
  },

  buildDraftStorageKey(date = this.data.selectedDate) {
    return makeDraftKey({
      studentId: this.studentId,
      date,
      userId: this.currentUser?.id || "",
    });
  },

  snapshotEditableState() {
    return {
      selectedDate: this.data.selectedDate,
      attendance: this.data.attendance,
      attendanceStart: this.data.attendanceStart,
      attendanceEnd: this.data.attendanceEnd,
      summary: this.data.summary || "",
      activities: JSON.parse(JSON.stringify(this.data.activities || [])),
    };
  },

  hasUnsavedChanges() {
    const base = this.editBaseline || null;
    if (!base) return false;
    const current = this.snapshotEditableState();
    try {
      return JSON.stringify(base) !== JSON.stringify(current);
    } catch (_) {
      return false;
    }
  },

  refreshEditBaseline() {
    this.editBaseline = this.snapshotEditableState();
  },

  saveDraftMeta(updatedAt = new Date().toISOString()) {
    const date = this.data.selectedDate;
    const storageKey = this.buildDraftStorageKey(date);
    this.setData({
      draftStorageKey: storageKey,
      hasDraft: true,
      draftUpdatedAtText: formatChinaDateTime(new Date(updatedAt)),
    });
  },

  clearDraftMeta() {
    this.setData({
      hasDraft: false,
      draftUpdatedAtText: "",
    });
  },

  applyDraftPayload(draft) {
    const attendanceLabel =
      attendanceMap.find((a) => a.value === draft.attendance)?.label || "出席";
    const activities = ensureEnglishActivity((draft.activities || []).map((a) => normalizeActivity(a)));
    const studyDefaults = this.getStudyAttendanceDefaults(draft.date || this.data.selectedDate);
    this.setData({
      selectedDate: draft.date || this.data.selectedDate,
      attendance: draft.attendance || "present",
      attendanceLabel,
      attendanceStart: draft.attendanceStart || studyDefaults.attendanceStart,
      attendanceEnd: draft.attendanceEnd || studyDefaults.attendanceEnd,
      summary: draft.summary || "",
      activities: this.decorateActivities(activities.length ? activities : [buildEnglishActivity()]),
      isEditing: true,
      isEditable: true,
      editingId: this.data.existingId || null,
    });
    this.refreshEditBaseline();
  },

  checkAndPromptDraft() {
    if (!this.data.isTeacher || !this.data.isEditable) return;
    const key = this.buildDraftStorageKey(this.data.selectedDate);
    const draft = wx.getStorageSync(key);
    if (!draft || typeof draft !== "object") {
      this.clearDraftMeta();
      return;
    }
    if (draft.studentId !== this.studentId || draft.date !== this.data.selectedDate) {
      this.clearDraftMeta();
      return;
    }
    this.saveDraftMeta(draft.updatedAt || new Date().toISOString());
    wx.showModal({
      title: "检测到暂存",
      content: "检测到未发表的暂存内容，是否继续编辑？",
      success: (res) => {
        if (!res.confirm) return;
        this.applyDraftPayload(draft);
        wx.showToast({ title: "已恢复暂存", icon: "none" });
      },
    });
  },

  clearLocalDraft() {
    const key = this.buildDraftStorageKey(this.data.selectedDate);
    wx.removeStorageSync(key);
    this.clearDraftMeta();
  },

  clearDraftConfirm() {
    if (!this.data.hasDraft) return;
    wx.showModal({
      title: "清除暂存？",
      content: "清除后将无法恢复未发表内容。",
      success: (res) => {
        if (!res.confirm) return;
        this.clearLocalDraft();
        wx.showToast({ title: "已清除暂存", icon: "none" });
      },
    });
  },

  saveLocalDraft() {
    if (!this.data.isEditable || this.data.draftSaving) return;
    const key = this.buildDraftStorageKey(this.data.selectedDate);
    const payload = buildDailyProgressDraftPayload({
      studentId: this.studentId,
      date: this.data.selectedDate,
      userId: this.currentUser?.id || "",
      formData: this.snapshotEditableState(),
    });
    this.setData({ draftSaving: true });
    try {
      wx.setStorageSync(key, payload);
      this.saveDraftMeta(payload.updatedAt);
      this.refreshEditBaseline();
      wx.showToast({ title: "已暂存到本机", icon: "success" });
    } catch (err) {
      wx.showToast({ title: "暂存失败", icon: "none" });
    } finally {
      this.setData({ draftSaving: false });
    }
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((data) => this.setData({ student: data }))
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchSubjects() {
    request({ url: `/students/${this.studentId}/subjects/full` })
      .then((data) => {
        const subjects = (data || [])
          .map((entry) => ({
            id: entry?.subject?.id,
            name: entry?.subject?.name,
            code: entry?.subject?.code,
          }))
          .filter((s) => s.id && s.name);
        const unique = [];
        const seen = new Set();
        subjects.forEach((s) => {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            unique.push(s);
          }
        });
        this.setData({
          subjects: unique,
          subjectOptions: unique.map((s) => formatSubjectName(s.name)),
        }, () => {
          this.ensureEnglishSubject(unique);
        });
      })
      .catch(() => {
        this.setData({ subjects: [], subjectOptions: [] });
      });
  },

  fetchTopicProgress() {
    if (!this.studentId) return;
    request({ url: `/students/${this.studentId}/subjects/full` })
      .then((data) => {
        const subjects = (data || []).map((entry) => {
          const topics = (entry?.topics || []).map(decorateTopic);
          return {
            subjectId: entry?.subject?.id || "",
            subject: entry?.subject
              ? { ...entry.subject, displayName: formatSubjectName(entry.subject.name) }
              : entry.subject,
            topics,
            totalCount: countTopics(topics),
          };
        });
        const expandedSubjects = { ...this.data.topicProgressExpandedSubjects };
        const expandedTopics = { ...this.data.topicProgressExpandedTopics };
        subjects.forEach((s) => {
          const sid = s?.subject?.id;
          if (sid && expandedSubjects[sid] === undefined) expandedSubjects[sid] = false;
          (s.topics || []).forEach((t) => {
            if (expandedTopics[t.id] === undefined) expandedTopics[t.id] = false;
          });
        });
        this.setData({
          topicProgressSubjects: subjects,
          topicProgressExpandedSubjects: expandedSubjects,
          topicProgressExpandedTopics: expandedTopics,
        });
      })
      .catch(() => {
        this.setData({ topicProgressSubjects: [] });
      });
  },

  toggleTopicProgressSubject(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = { ...this.data.topicProgressExpandedSubjects };
    expanded[id] = !expanded[id];
    this.setData({ topicProgressExpandedSubjects: expanded });
  },

  toggleTopicProgressTopic(e) {
    const id = e.currentTarget.dataset.id;
    const expanded = { ...this.data.topicProgressExpandedTopics };
    expanded[id] = !expanded[id];
    this.setData({ topicProgressExpandedTopics: expanded });
  },

  updateTopicCondition(e) {
    if (!this.data.isEditable) return;
    const topicId = e.currentTarget.dataset.topic;
    const condition = e.currentTarget.dataset.condition;
    const currentValue = e.currentTarget.dataset.value;
    const isActive = currentValue === true || currentValue === "true";
    const payload = { [condition]: !isActive };
    request({
      url: `/students/${this.studentId}/topics/${topicId}/progress`,
      method: "PUT",
      data: payload,
    })
      .then(() => this.fetchTopicProgress())
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || "章节进度更新失败", icon: "none" });
      });
  },

  fetchPaperTypes() {
    request({ url: "/paper-types" })
      .then((data) => {
        const types = data || [];
        const options = ["请选择类型", ...types.map((t) => t.name)];
        this.setData({ paperTypes: types, paperTypeOptions: options }, () => this.syncPaperPickers());
      })
      .catch(() => this.setData({ paperTypes: [], paperTypeOptions: ["请选择类型"] }));
  },

  fetchPaperSchools() {
    request({ url: "/paper-schools" })
      .then((data) => {
        const schools = data || [];
        const options = ["请选择学校", ...schools.map((s) => s.name)];
        this.setData({ paperSchools: schools, paperSchoolOptions: options }, () => this.syncPaperPickers());
      })
      .catch(() => this.setData({ paperSchools: [], paperSchoolOptions: ["请选择学校"] }));
  },

  fetchProgress() {
    wx.request({
      url: `${getApp().globalData.apiBaseUrl}/progress/student?studentId=${this.studentId}&date=${this.data.selectedDate}`,
      header: {
        Authorization: `Bearer ${wx.getStorageSync("token")}`,
      },
      success: (res) => {
        if (res.statusCode === 404) {
          if (this.data.isTeacher) {
            const studyDefaults = this.getStudyAttendanceDefaults();
            this.setData({
              isEditing: true,
              isEditable: true,
              existingId: null,
              backup: null,
              editingId: null,
              attendance: "present",
              attendanceLabel: "出席",
              attendanceStart: studyDefaults.attendanceStart,
              attendanceEnd: studyDefaults.attendanceEnd,
              summary: "",
              activities: this.decorateActivities([buildEnglishActivity()]),
              lastUpdatedAt: "",
              lastUpdatedBy: "",
              lastUpdatedAtText: "",
            }, () => {
              this.refreshEditBaseline();
              this.checkAndPromptDraft();
            });
          }
          this.fetchPapersForDate();
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const entry = res.data;
          const attendanceLabel = attendanceMap.find((a) => a.value === entry.attendance)?.label || "出席";
          const activities = ensureEnglishActivity((entry.activities || []).map((a) => normalizeActivity(a)));
          const studyDefaults = this.getStudyAttendanceDefaults(entry.date || this.data.selectedDate);
          const updatedAtText = entry.updatedAt
            ? formatChinaDateTime(new Date(entry.updatedAt))
            : "";
          this.setData({
            existingId: entry.id,
            editingId: null,
            attendance: entry.attendance,
            attendanceLabel,
            attendanceStart: entry.attendanceStart || studyDefaults.attendanceStart,
            attendanceEnd: entry.attendanceEnd || studyDefaults.attendanceEnd,
            summary: entry.summary || "",
            activities: this.decorateActivities(
              activities.length ? activities : [buildEnglishActivity()],
            ),
            isEditing: false,
            isEditable: false,
            backup: null,
            lastUpdatedAt: entry.updatedAt || "",
            lastUpdatedBy: entry.updatedByName || "",
            lastUpdatedAtText: updatedAtText,
          }, () => {
            this.refreshEditBaseline();
            this.clearDraftMeta();
          });
          this.fetchPapersForDate();
        } else {
          wx.showToast({ title: "获取记录失败", icon: "error" });
        }
      },
      fail: () => wx.showToast({ title: "获取记录失败", icon: "error" }),
    });
  },

  onDateChange(e) {
    if (!this.data.isEditable) return;
    const nextDate = e.detail.value;
    const studyDefaults = this.getStudyAttendanceDefaults(nextDate);
    // Changing date should load existing record if available; otherwise start a new blank record.
    this.setData({
      selectedDate: nextDate,
      draftStorageKey: this.buildDraftStorageKey(nextDate),
      existingId: null,
      editingId: null,
      isEditing: false,
      isEditable: false,
      backup: null,
      attendance: "present",
      attendanceLabel: "出席",
      attendanceStart: studyDefaults.attendanceStart,
      attendanceEnd: studyDefaults.attendanceEnd,
      activities: this.decorateActivities([buildEnglishActivity()]),
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      lastUpdatedAtText: "",
      papersUpdatedAt: "",
      papersUpdatedBy: "",
      papersUpdatedAtText: "",
    });
    this.clearDraftMeta();
    this.fetchProgress();
  },

  fetchPapersForDate() {
    if (!this.studentId || !this.data.selectedDate) return;
    request({ url: `/students/${this.studentId}/papers?date=${this.data.selectedDate}` })
      .then((data) => this.applyPapersToActivities(data || []))
      .catch(() => this.applyPapersToActivities([]));
  },

  bindEnglishSubject(english) {
    if (!english?.id) return;
    const activities = (this.data.activities || []).map((a) => {
      if (a.type === "english") {
        return {
          ...a,
          subjectId: english.id,
          subjectName: english.name || a.subjectName,
          subjectDisplayName: formatSubjectName(english.name || a.subjectName),
        };
      }
      return a;
    });
    this.setData({ activities });
  },

  ensureEnglishSubject(subjects = []) {
    const english = subjects.find((s) => isEnglishSubject(s));
    if (english) {
      this.bindEnglishSubject(english);
      return;
    }

    if (!this.data.isTeacher || this.englishAssigning) return;
    this.englishAssigning = true;

    request({ url: "/subjects" })
      .then((all) => {
        const englishGlobal = (all || []).find((s) => isEnglishSubject(s));
        if (!englishGlobal) {
          wx.showToast({ title: "未找到英文科目，请在后台添加", icon: "none" });
          return null;
        }
        const currentIds = (subjects || []).map((s) => s.id).filter(Boolean);
        if (currentIds.includes(englishGlobal.id)) {
          this.bindEnglishSubject(englishGlobal);
          return null;
        }
        return request({
          url: `/students/${this.studentId}/subjects`,
          method: "PUT",
          data: {
            subjectIds: [...currentIds, englishGlobal.id],
            resetProgress: "keep",
          },
        }).then(() => englishGlobal);
      })
      .then((englishGlobal) => {
        if (!englishGlobal) return;
        const nextSubjects = [
          ...subjects,
          { id: englishGlobal.id, name: englishGlobal.name, code: englishGlobal.code },
        ];
        this.setData({
          subjects: nextSubjects,
          subjectOptions: nextSubjects.map((s) => formatSubjectName(s.name)),
        });
        this.bindEnglishSubject(englishGlobal);
      })
      .catch(() => {
        wx.showToast({ title: "同步英文科目失败", icon: "none" });
      })
      .finally(() => {
        this.englishAssigning = false;
      });
  },

  applyPapersToActivities(papers) {
    const grouped = {};
    (papers || []).forEach((p) => {
      const key = p.subjectId || p.subjectName || "";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(buildPaperEntry(p));
    });
    let latestAt = "";
    let latestBy = "";
    (papers || []).forEach((p) => {
      if (!p.updatedAt) return;
      if (!latestAt || new Date(p.updatedAt).getTime() > new Date(latestAt).getTime()) {
        latestAt = p.updatedAt;
        latestBy = p.updatedByName || "";
      }
    });
    const latestText = latestAt ? formatChinaDateTime(new Date(latestAt)) : "";
    const activities = (this.data.activities || []).map((a) => {
      const key = a.subjectId || a.subjectName || "";
      return { ...a, papers: (grouped[key] || []).map((p) => buildPaperEntry(p)) };
    });
    this.setData(
      {
        activities,
        papersUpdatedAt: latestAt || "",
        papersUpdatedBy: latestBy || "",
        papersUpdatedAtText: latestText,
      },
      () => this.syncPaperPickers()
    );
  },

  onAttendanceChange(e) {
    const index = e.detail.value;
    const option = attendanceMap[index];
    if (!option) return;
    this.setData({ attendance: option.value, attendanceLabel: option.label });
  },

  onAttendanceStartChange(e) {
    if (!this.data.isEditable) return;
    this.setData({ attendanceStart: e.detail.value });
  },

  onAttendanceEndChange(e) {
    if (!this.data.isEditable) return;
    this.setData({ attendanceEnd: e.detail.value });
  },

  onTimeInputChange(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onTimeInputBlur(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    const value = (e.detail.value || "").trim();
    if (!field) return;
    if (!value) {
      this.setData({ [field]: "" });
      return;
    }
    const isValid = /^([01]\\d|2[0-3]):([0-5]\\d)$/.test(value);
    if (!isValid) {
      wx.showToast({ title: "请输入有效时间 HH:mm", icon: "none" });
      return;
    }
    this.setData({ [field]: value });
  },

  onFieldInput(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onActivityChange(e) {
    // Used for shared narrative fields (taskSummary/strengths/improvements),
    // generic-only fields (definitionRecitation), and optional comments.
    // V2 english scored sub-fields go through dedicated handlers below.
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const activities = [...this.data.activities];
    activities[index] = { ...activities[index], [field]: e.detail.value };
    this.setData({ activities: this.decorateActivities(activities) });
  },

  // ---- V2 English handlers ----

  updateEnglishBlock(index, sub, patch) {
    const activities = [...this.data.activities];
    const a = activities[index];
    if (!a || a.type !== "english" || !a.english) return;
    const eng = { ...a.english };
    eng[sub] = { ...(eng[sub] || {}), ...patch };
    activities[index] = { ...a, english: eng };
    this.setData({ activities: this.decorateActivities(activities) });
  },

  onEnglishTextChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    this.updateEnglishBlock(idx, sub, { text: e.detail.value });
  },

  onEnglishScoreChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    this.updateEnglishBlock(idx, sub, { score: toBoundedScore(e.detail.value) });
  },

  onEnglishTotalScoreChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    this.updateEnglishBlock(idx, sub, { totalScore: toBoundedTotalScore(e.detail.value) });
  },

  onEnglishCountChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield; // editing/reading/grammar/vocab
    const key = e.currentTarget.dataset.key;       // exerciseCount/articleCount/vocabularySentenceCount
    if (!key) return;
    const maxMap = {
      exerciseCount: LIMITS.englishExerciseMax,
      articleCount: LIMITS.englishExerciseMax,
      vocabularyWordCount: LIMITS.englishVocabMax,
      vocabularySentenceCount: LIMITS.englishSentenceMax,
    };
    const max = maxMap[key] || LIMITS.englishExerciseMax;
    const count = clampIntInput(e.detail.value, 0, max);
    const patch = { [key]: count };
    if (sub === "editing" || sub === "grammar" || sub === "reading") {
      const a = this.data.activities[idx];
      const block = a?.english?.[sub] || {};
      const existing = Array.isArray(block.exercises) ? block.exercises : [];
      const next = [];
      for (let i = 0; i < count; i++) {
        next.push(existing[i] || { score: null, totalScore: toBoundedTotalScore(block.totalScore) || 100, problems: "" });
      }
      patch.exercises = next;
    }
    this.updateEnglishBlock(idx, sub, patch);
  },

  onExerciseScoreChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const a = this.data.activities[idx];
    const block = a?.english?.[sub] || {};
    const list = Array.isArray(block.exercises) ? block.exercises.slice() : [];
    while (list.length <= exIdx) list.push({ score: null, totalScore: toBoundedTotalScore(block.totalScore) || 100, problems: "" });
    list[exIdx] = { ...list[exIdx], score: toBoundedScore(e.detail.value) };
    this.updateEnglishBlock(idx, sub, { exercises: list });
  },

  onExerciseTotalScoreChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const a = this.data.activities[idx];
    const block = a?.english?.[sub] || {};
    const list = Array.isArray(block.exercises) ? block.exercises.slice() : [];
    while (list.length <= exIdx) list.push({ score: null, totalScore: toBoundedTotalScore(block.totalScore) || 100, problems: "" });
    list[exIdx] = { ...list[exIdx], totalScore: toBoundedTotalScore(e.detail.value) };
    this.updateEnglishBlock(idx, sub, { exercises: list });
  },

  onExerciseProblemsChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const a = this.data.activities[idx];
    const block = a?.english?.[sub] || {};
    const list = Array.isArray(block.exercises) ? block.exercises.slice() : [];
    while (list.length <= exIdx) list.push({ score: null, totalScore: toBoundedTotalScore(block.totalScore) || 100, problems: "" });
    list[exIdx] = { ...list[exIdx], problems: e.detail.value };
    this.updateEnglishBlock(idx, sub, { exercises: list });
  },

  onEnglishOtherChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    this.updateEnglishBlock(idx, sub, { otherLossPointText: e.detail.value });
  },

  onLossPointToggle(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    const sub = e.currentTarget.dataset.subfield;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const a = this.data.activities[idx];
    const block = a?.english?.[sub] || {};
    const ids = Array.isArray(block.lossPointIds) ? block.lossPointIds.slice() : [];
    const at = ids.indexOf(id);
    if (at >= 0) ids.splice(at, 1);
    else ids.push(id);
    // Server re-snapshots labels on save — leave local snapshot unchanged.
    this.updateEnglishBlock(idx, sub, { lossPointIds: ids });
  },

  onEssayCompletedToggle(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    // checkbox-group emits e.detail.value as array of selected values
    const checked = Array.isArray(e.detail.value) ? e.detail.value.includes("done") : !!e.detail.value;
    this.updateEnglishBlock(idx, "essay", { completed: checked });
  },

  onEssayTitleChange(e) {
    if (!this.data.isEditable) return;
    const idx = e.currentTarget.dataset.index;
    this.updateEnglishBlock(idx, "essay", { title: e.detail.value });
  },

  updateCustomEnglishTask(index, taskIndex, patch) {
    const activities = [...this.data.activities];
    const activity = activities[index];
    if (!activity || activity.type !== "english") return;
    const custom = Array.isArray(activity.customEnglishTasks)
      ? activity.customEnglishTasks.map((item) => ({ ...item }))
      : [];
    if (!custom[taskIndex]) return;
    custom[taskIndex] = { ...custom[taskIndex], ...patch };
    activities[index] = { ...activity, customEnglishTasks: custom };
    this.setData({ activities: this.decorateActivities(activities) });
  },

  toggleCustomEnglishTask(e) {
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    const activity = this.data.activities[idx];
    const task = activity?.customEnglishTasks?.[taskIndex];
    if (!task) return;
    this.updateCustomEnglishTask(idx, taskIndex, { uiExpanded: !task.uiExpanded });
  },

  onCustomTaskCountInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    const value = clampIntInput(e.detail.value, 0, LIMITS.englishExerciseMax);
    const activity = this.data.activities[idx];
    const task = activity?.customEnglishTasks?.[taskIndex] || {};
    const existing = Array.isArray(task.exercises) ? task.exercises : [];
    const fallbackTotal = toBoundedTotalScore(task.maxScore) || 100;
    const next = [];
    for (let i = 0; i < value; i++) {
      next.push(existing[i] || { score: null, totalScore: fallbackTotal, problems: "" });
    }
    this.updateCustomEnglishTask(idx, taskIndex, { practiceCount: value, exercises: next, completed: value > 0 });
  },

  onCustomTaskScoreInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    this.updateCustomEnglishTask(idx, taskIndex, {
      score: toBoundedScore(e.detail.value),
    });
  },

  onCustomTaskMaxScoreInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    this.updateCustomEnglishTask(idx, taskIndex, {
      maxScore: toBoundedTotalScore(e.detail.value),
    });
  },

  onCustomTaskProblemsInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    this.updateCustomEnglishTask(idx, taskIndex, { problems: e.detail.value || "" });
  },

  onCustomTaskExerciseScoreInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const activity = this.data.activities[idx];
    const task = activity?.customEnglishTasks?.[taskIndex] || {};
    const list = Array.isArray(task.exercises) ? task.exercises.slice() : [];
    const fallbackTotal = toBoundedTotalScore(task.maxScore) || 100;
    while (list.length <= exIdx) list.push({ score: null, totalScore: fallbackTotal, problems: "" });
    list[exIdx] = { ...list[exIdx], score: toBoundedScore(e.detail.value) };
    this.updateCustomEnglishTask(idx, taskIndex, { exercises: list });
  },

  onCustomTaskExerciseTotalInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const activity = this.data.activities[idx];
    const task = activity?.customEnglishTasks?.[taskIndex] || {};
    const list = Array.isArray(task.exercises) ? task.exercises.slice() : [];
    const fallbackTotal = toBoundedTotalScore(task.maxScore) || 100;
    while (list.length <= exIdx) list.push({ score: null, totalScore: fallbackTotal, problems: "" });
    list[exIdx] = { ...list[exIdx], totalScore: toBoundedTotalScore(e.detail.value) };
    this.updateCustomEnglishTask(idx, taskIndex, { exercises: list });
  },

  onCustomTaskExerciseProblemsInput(e) {
    if (!this.data.isEditable) return;
    const idx = Number(e.currentTarget.dataset.index);
    const taskIndex = Number(e.currentTarget.dataset.taskIndex);
    const exIdx = Number(e.currentTarget.dataset.exerciseIndex);
    if (!Number.isInteger(exIdx)) return;
    const activity = this.data.activities[idx];
    const task = activity?.customEnglishTasks?.[taskIndex] || {};
    const list = Array.isArray(task.exercises) ? task.exercises.slice() : [];
    const fallbackTotal = toBoundedTotalScore(task.maxScore) || 100;
    while (list.length <= exIdx) list.push({ score: null, totalScore: fallbackTotal, problems: "" });
    list[exIdx] = { ...list[exIdx], problems: e.detail.value || "" };
    this.updateCustomEnglishTask(idx, taskIndex, { exercises: list });
  },

  syncPaperPickers() {
    const { paperTypes, paperSchools } = this.data;
    const activities = (this.data.activities || []).map((a) => {
      const papers = (a.papers || []).map((p) => {
        const typeIndex = p.typeId ? paperTypes.findIndex((t) => t.id === p.typeId) + 1 : 0;
        const schoolIndex = p.schoolId ? paperSchools.findIndex((s) => s.id === p.schoolId) + 1 : 0;
        return { ...p, typeIndex: Math.max(typeIndex, 0), schoolIndex: Math.max(schoolIndex, 0) };
      });
      return { ...a, papers };
    });
    this.setData({ activities });
  },

  addPaperType(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    wx.showModal({
      title: "新增试卷类型",
      editable: true,
      placeholderText: "例如：模拟考",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-types", method: "POST", data: { name } })
          .then((created) => {
            this.fetchPaperTypes();
            if (created?.id) {
              const activities = [...this.data.activities];
              const papers = activities[index].papers || [];
              if (papers[paperIndex]) {
                papers[paperIndex].typeId = created.id;
              }
              activities[index].papers = papers;
              this.setData({ activities }, () => this.syncPaperPickers());
            }
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.message || "添加失败", icon: "error" });
          });
      },
    });
  },

  addPaperSchool(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    wx.showModal({
      title: "新增学校",
      editable: true,
      placeholderText: "例如：南山中学",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-schools", method: "POST", data: { name } })
          .then((created) => {
            this.fetchPaperSchools();
            if (created?.id) {
              const activities = [...this.data.activities];
              const papers = activities[index].papers || [];
              if (papers[paperIndex]) {
                papers[paperIndex].schoolId = created.id;
              }
              activities[index].papers = papers;
              this.setData({ activities }, () => this.syncPaperPickers());
            }
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.message || "添加失败", icon: "error" });
          });
      },
    });
  },

  addPaper(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    papers.push(buildPaperEntry());
    activities[index].papers = papers;
    this.setData({ activities });
  },

  removePaper(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    activities[index].papers = papers.filter((_, i) => i !== paperIndex);
    this.setData({ activities });
  },

  onPaperChange(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const field = e.currentTarget.dataset.field;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target[field] = e.detail.value;
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onPaperTypePick(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const typeIndex = Number(e.detail.value);
    const type = this.data.paperTypes[typeIndex - 1];
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target.typeIndex = typeIndex;
    target.typeId = type ? type.id : "";
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onPaperSchoolPick(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const schoolIndex = Number(e.detail.value);
    const school = this.data.paperSchools[schoolIndex - 1];
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target.schoolIndex = schoolIndex;
    target.schoolId = school ? school.id : "";
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onSubjectPick(e) {
    if (!this.data.isEditable) return;
    const index = Number(e.detail.value);
    const subject = this.data.subjects[index];
    if (!subject) return;
    const exists = this.data.activities.some((a) => a.subjectId === subject.id);
    if (exists) {
      wx.showToast({ title: "该科目已添加", icon: "none" });
      return;
    }
    const activities = [...this.data.activities, buildActivityForSubject(subject)];
    this.setData({ activities: this.decorateActivities(ensureEnglishActivity(activities)) });
  },

  removeActivity(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const activities = this.data.activities.filter((_, i) => i !== index);
    this.setData({ activities: this.decorateActivities(ensureEnglishActivity(activities)) });
  },

  startEdit() {
    this.setData({
      isEditing: true,
      isEditable: true,
      editingId: this.data.existingId,
      backup: {
        selectedDate: this.data.selectedDate,
        attendance: this.data.attendance,
        attendanceLabel: this.data.attendanceLabel,
        attendanceStart: this.data.attendanceStart,
        attendanceEnd: this.data.attendanceEnd,
        summary: this.data.summary,
        activities: JSON.parse(JSON.stringify(this.data.activities)),
        existingId: this.data.existingId,
      },
    }, () => {
      this.refreshEditBaseline();
      this.checkAndPromptDraft();
    });
  },

  cancelEdit() {
    const discard = () => {
      if (!this.data.existingId && !this.data.backup) {
        wx.navigateBack();
        return;
      }
      const backup = this.data.backup;
      if (!backup) {
        this.setData({ isEditing: false, isEditable: false });
        return;
      }
      this.setData({
        selectedDate: backup.selectedDate,
        attendance: backup.attendance,
        attendanceLabel: backup.attendanceLabel,
        attendanceStart: backup.attendanceStart || "",
        attendanceEnd: backup.attendanceEnd || "",
        summary: backup.summary || "",
        activities: backup.activities,
        existingId: backup.existingId,
        editingId: null,
        isEditing: false,
        isEditable: false,
        backup: null,
      });
      this.fetchProgress();
    };

    if (!this.hasUnsavedChanges()) {
      discard();
      return;
    }

    wx.showModal({
      title: "放弃修改？",
      content: this.data.hasDraft
        ? "当前有未发表内容，确定放弃本次修改并清除暂存吗？"
        : "当前有未保存修改，确定放弃吗？",
      success: (res) => {
        if (!res.confirm) return;
        if (this.data.hasDraft) this.clearLocalDraft();
        discard();
      },
    });
  },

  deleteEntry() {
    if (!this.data.existingId) return;
    wx.showModal({
      title: "确认删除",
      content: "删除后将进入该学生的回收站，可在 30 天内恢复。",
      success: (res) => {
        if (!res.confirm) return;
        const updatedAt = encodeURIComponent(this.data.lastUpdatedAt || "");
        request({ url: `/progress/${this.data.existingId}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            wx.navigateBack();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            if (showConflictModal(err, () => this.fetchProgress())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },

  save() {
    this.publish();
  },

  publish() {
    if (!this.data.isEditable) return;
    if (this.data.publishing) return;
    if (!this.data.selectedDate) {
      wx.showToast({ title: "请选择日期", icon: "none" });
      return;
    }

    if (!this.data.attendanceStart || !this.data.attendanceEnd) {
      wx.showToast({ title: "请填写出勤时间", icon: "none" });
      return;
    }

    if (!this.data.activities.length) {
      wx.showToast({ title: "请先添加科目活动", icon: "none" });
      return;
    }

    const missingNarrative = (this.data.activities || []).find((a) => {
      if (a?.type === "english") return false;
      const taskSummary = String(a?.taskSummary || "").trim();
      const strengths = String(a?.strengths || "").trim();
      const improvements = String(a?.improvements || "").trim();
      return !taskSummary || !strengths || !improvements;
    });
    if (missingNarrative) {
      wx.showModal({
        title: "请完善学情描述",
        content: `${missingNarrative.subjectDisplayName || missingNarrative.subjectName || "该科目"}：请填写“学生具体做了什么、做得好的地方、需要进步的地方”`,
        showCancel: false,
      });
      return;
    }

    const findInvalidPaper = () => {
      for (let aIdx = 0; aIdx < (this.data.activities || []).length; aIdx += 1) {
        const activity = this.data.activities[aIdx] || {};
        const subjectName = activity.subjectDisplayName || activity.subjectName || `科目${aIdx + 1}`;
        const papers = Array.isArray(activity.papers) ? activity.papers : [];
        for (let pIdx = 0; pIdx < papers.length; pIdx += 1) {
          const p = papers[pIdx] || {};
          const touched = Boolean(
            p.typeId ||
            p.schoolId ||
            String(p.description || "").trim() ||
            String(p.score ?? "").trim() ||
            String(p.total ?? "").trim() ||
            String(p.strengths || "").trim() ||
            String(p.improvements || "").trim()
          );
          if (!touched) continue;
          if (!p.typeId || !p.schoolId) {
            return { subjectName, paperIndex: pIdx + 1, reason: "请选择试卷类型和学校" };
          }
          if (!String(p.strengths || "").trim()) {
            return { subjectName, paperIndex: pIdx + 1, reason: "请填写“做得好的地方”" };
          }
          if (!String(p.improvements || "").trim()) {
            return { subjectName, paperIndex: pIdx + 1, reason: "请填写“需要改进的地方”" };
          }
        }
      }
      return null;
    };

    const invalidPaper = findInvalidPaper();
    if (invalidPaper) {
      wx.showModal({
        title: "请完善试卷评价",
        content: `${invalidPaper.subjectName} 第${invalidPaper.paperIndex}份试卷：${invalidPaper.reason}`,
        showCancel: false,
      });
      return;
    }

    if (trimText(this.data.summary).length > LIMITS.summaryMax) {
      wx.showToast({ title: `总结过长（最多 ${LIMITS.summaryMax} 字）`, icon: "none" });
      return;
    }

    if ((this.data.activities || []).length > LIMITS.dailyActivityMax) {
      wx.showToast({ title: `活动数量过多（最多 ${LIMITS.dailyActivityMax} 条）`, icon: "none" });
      return;
    }

    for (const activity of this.data.activities || []) {
      const subjectName = activity?.subjectDisplayName || activity?.subjectName || "该科目";
      const checkText = (value, label, max = LIMITS.activityTextMax) => {
        if (trimText(value).length > max) {
          wx.showToast({ title: `${subjectName}${label}过长`, icon: "none" });
          return false;
        }
        return true;
      };
      if (!checkText(activity?.taskSummary, "学习内容")) return;
      if (!checkText(activity?.strengths, "亮点")) return;
      if (!checkText(activity?.improvements, "待提升点")) return;
      if (!checkText(activity?.comment, "备注")) return;
      const papers = Array.isArray(activity?.papers) ? activity.papers : [];
      if (papers.length > LIMITS.papersBatchMax) {
        wx.showToast({ title: "试卷数量过多，请分次保存", icon: "none" });
        return;
      }
      for (const p of papers) {
        if (!checkText(p?.description, "试卷描述", LIMITS.shortTextMax)) return;
        if (!checkText(p?.strengths, "试卷优点")) return;
        if (!checkText(p?.improvements, "试卷改进点")) return;
        const scoreText = trimText(p?.score);
        const totalText = trimText(p?.total);
        const score = scoreText ? Number(scoreText) : null;
        const total = totalText ? Number(totalText) : null;
        if (score != null && (!Number.isFinite(score) || score < 0 || score > LIMITS.scoreMax)) {
          wx.showToast({ title: "试卷得分不在合理范围", icon: "none" });
          return;
        }
        if (total != null && (!Number.isFinite(total) || total <= 0 || total > LIMITS.scoreMax)) {
          wx.showToast({ title: "试卷总分不在合理范围", icon: "none" });
          return;
        }
        if (score != null && total != null && score > total) {
          wx.showToast({ title: "试卷得分不能超过总分", icon: "none" });
          return;
        }
      }
      if (activity?.type !== "english") continue;
      const english = activity?.english || {};
      const editing = english.editing || {};
      const reading = english.reading || {};
      const grammar = english.grammar || {};
      const vocab = english.vocab || {};
      const exerciseFields = [
        { label: "改错题量", value: editing.exerciseCount, max: LIMITS.englishExerciseMax },
        { label: "阅读篇数", value: reading.articleCount, max: LIMITS.englishExerciseMax },
        { label: "语法题量", value: grammar.exerciseCount, max: LIMITS.englishExerciseMax },
        { label: "单词数量", value: vocab.vocabularyWordCount, max: LIMITS.englishVocabMax },
        { label: "句子数量", value: vocab.vocabularySentenceCount, max: LIMITS.englishSentenceMax },
      ];
      for (const field of exerciseFields) {
        const count = Number(field.value || 0);
        if (!Number.isFinite(count) || count < 0 || count > field.max) {
          wx.showToast({ title: `${field.label}超过限制`, icon: "none" });
          return;
        }
      }
      const checkScore = (label, value) => {
        if (value == null || value === "") return true;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > LIMITS.englishScoreMax) {
          wx.showToast({ title: `${label}分数超范围`, icon: "none" });
          return false;
        }
        return true;
      };
      const checkTotal = (label, value) => {
        if (value == null || value === "") return true;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0 || n > LIMITS.englishScoreMax) {
          wx.showToast({ title: `${label}满分超范围`, icon: "none" });
          return false;
        }
        return true;
      };
      const checkPair = (label, score, total, fallbackTotal = null) => {
        if (!checkScore(label, score)) return false;
        if (!checkTotal(label, total)) return false;
        if (score == null || score === "") return true;
        const s = Number(score);
        const t = total == null || total === "" ? fallbackTotal : Number(total);
        if (!Number.isFinite(t) || t <= 0) {
          wx.showToast({ title: `${label}请填写满分`, icon: "none" });
          return false;
        }
        if (s > t) {
          wx.showToast({ title: `${label}得分不能超过满分`, icon: "none" });
          return false;
        }
        return true;
      };
      if (!checkScore("改错", editing.score)) return;
      if (!checkScore("阅读", reading.score)) return;
      if (!checkScore("语法", grammar.score)) return;
      if (!checkPair("作文", english?.essay?.score, english?.essay?.totalScore, 100)) return;
      const exerciseGroups = [editing.exercises || [], reading.exercises || [], grammar.exercises || []];
      for (const group of exerciseGroups) {
        if (group.length > LIMITS.englishExerciseMax) {
          wx.showToast({ title: "英文练习条数过多", icon: "none" });
          return;
        }
        for (const ex of group) {
          if (!checkPair("英文", ex?.score, ex?.totalScore, 100)) return;
          if (trimText(ex?.problems).length > LIMITS.activityTextMax) {
            wx.showToast({ title: "英文错因描述过长", icon: "none" });
            return;
          }
          if (isImperfectScore(ex?.score, ex?.totalScore, 100) && !trimText(ex?.problems)) {
            wx.showToast({ title: "非满分请填写出现的问题", icon: "none" });
            return;
          }
        }
      }
      const essay = english?.essay || {};
      if (isImperfectScore(essay?.score, essay?.totalScore, 100) && !trimText(essay?.text)) {
        wx.showToast({ title: "作文非满分请填写出现的问题", icon: "none" });
        return;
      }
      const customTasks = Array.isArray(activity?.customEnglishTasks) ? activity.customEnglishTasks : [];
      for (const task of customTasks) {
        const label = task.displayName || "英文项目";
        const fieldsUsed = Array.isArray(task.fieldsUsed) ? task.fieldsUsed : [];
        const usesPracticeCount = fieldsUsed.indexOf("practiceCount") !== -1;
        const usesScore = fieldsUsed.indexOf("score") !== -1;
        const usesProblems = fieldsUsed.indexOf("problems") !== -1;
        const count = Number(task.practiceCount || 0);
        if (!Number.isFinite(count) || count < 0 || count > LIMITS.englishExerciseMax) {
          wx.showToast({ title: `${label}练习数超过限制`, icon: "none" });
          return;
        }
        if (usesPracticeCount) {
          const exercises = Array.isArray(task.exercises) ? task.exercises : [];
          if (exercises.length > LIMITS.englishExerciseMax) {
            wx.showToast({ title: `${label}练习条数过多`, icon: "none" });
            return;
          }
          for (let exIndex = 0; exIndex < exercises.length; exIndex += 1) {
            const ex = exercises[exIndex] || {};
            if (usesScore && !checkPair(`${label}练习${exIndex + 1}`, ex.score, ex.totalScore, 100)) return;
            if (trimText(ex.problems).length > LIMITS.activityTextMax) {
              wx.showToast({ title: `${label}错因描述过长`, icon: "none" });
              return;
            }
            if (usesProblems && usesScore && isImperfectScore(ex.score, ex.totalScore, 100) && !trimText(ex.problems)) {
              wx.showToast({ title: `${label}练习${exIndex + 1}非满分请填写出现的问题`, icon: "none" });
              return;
            }
          }
        } else {
          if (!checkPair(label, task.score, task.maxScore, 100)) return;
          if (usesProblems && isImperfectScore(task.score, task.maxScore, 100) && !trimText(task.problems)) {
            wx.showToast({ title: `${label}非满分请填写出现的问题`, icon: "none" });
            return;
          }
        }
      }
    }

    // Strip the locally-derived helper fields (chips, hasAnyScore, per-exercise
    // showProblems/isScored) from each english sub-block before saving. They
    // are precomputed for WXML rendering only — the server doesn't store them.
    const stripDerived = (eng) => {
      const out = {};
      Object.keys(eng || {}).forEach((k) => {
        const v = eng[k];
        if (v && typeof v === "object" && !Array.isArray(v)) {
          const { chips, hasAnyScore, anyImperfect, showProblems, uiSummary, uiHasData, uiExpanded, ...rest } = v;
          if (Array.isArray(rest.exercises)) {
            rest.exercises = rest.exercises.map((ex) => {
              const { showProblems, isScored, ...exRest } = ex || {};
              return exRest;
            });
          }
          out[k] = rest;
        } else {
          out[k] = v;
        }
      });
      return out;
    };
    const stripChips = stripDerived;

    const taskConfig = normalizeEnglishTaskConfig(this.data.englishTaskConfig || DEFAULT_ENGLISH_TASKS);
    const taskConfigMap = new Map(taskConfig.map((task) => [task.key, task]));
    const cleaned = ensureEnglishActivity(this.data.activities).map((a) => {
      const type = a.type || (a.english ? "english" : "generic");
      const payload = {
        subjectId: a.subjectId || "",
        subjectName: a.subjectName || "",
        type,
        taskSummary: a.taskSummary || "",
        strengths: a.strengths || "",
        improvements: a.improvements || "",
        // Keep legacy field for backward compatibility in downstream reads.
        practiceProgress: a.taskSummary || a.practiceProgress || "",
        definitionRecitation: a.definitionRecitation || "",
        comment: a.comment || "",
      };
      if (type === "english") {
        const strippedEnglish = stripChips(a.english || buildEnglishFields());
        payload.english = strippedEnglish;
        const customTasks = normalizeCustomEnglishTasks(a.customEnglishTasks);
        const canonicalSnapshots = canonicalEnglishTaskKeys
          .map((key) => {
            const configTask = taskConfigMap.get(key);
            if (!configTask || configTask.enabled === false) return null;
            return canonicalTaskSnapshot(key, strippedEnglish[key] || {}, configTask);
          })
          .filter(Boolean);
        payload.englishTasks = [...canonicalSnapshots, ...customTasks].map((task) => ({
          taskId: task.taskId || task.id || task.key,
          key: task.key,
          displayName: task.displayName,
          chineseName: task.chineseName || "",
          englishName: task.englishName || "",
          practiceCount: toIntOrZero(task.practiceCount),
          score: toScoreOrNull(task.score),
          maxScore: toScoreOrNull(task.maxScore),
          problems: trimText(task.problems || summarizeTaskExerciseProblems(task.exercises)),
          exercises: (Array.isArray(task.exercises) ? task.exercises : []).map((ex) => ({
            score: toScoreOrNull(ex?.score),
            totalScore: toScoreOrNull(ex?.totalScore),
            problems: trimText(ex?.problems || ""),
          })),
          completed: task.completed === true,
          targetCount: toIntOrZero(task.targetCount),
          fieldsUsed: Array.isArray(task.fieldsUsed) ? task.fieldsUsed : ["practiceCount", "score", "problems"],
        }));
      }
      return payload;
    });

    const payload = {
      studentId: this.studentId,
      date: this.data.selectedDate,
      attendance: this.data.attendance,
      attendanceStart: this.data.attendanceStart,
      attendanceEnd: this.data.attendanceEnd,
      summary: this.data.summary || "",
      activities: cleaned,
    };

    const updateId = this.data.editingId || this.data.existingId;
    const requestConfig = updateId
      ? { url: `/progress/${updateId}`, method: "PUT", data: { ...payload, updatedAt: this.data.lastUpdatedAt } }
      : { url: "/progress", method: "POST", data: payload };

    this.setData({ publishing: true });
    request(requestConfig)
      .then((data) => {
        const paperPayloads = [];
        (this.data.activities || []).forEach((a) => {
          (a.papers || []).forEach((p) => {
            if (!p.typeId || !p.schoolId) return;
            paperPayloads.push({
              subjectId: a.subjectId || "",
              subjectName: a.subjectName || "",
              typeId: p.typeId,
              schoolId: p.schoolId,
              description: p.description || "",
              strengths: p.strengths || "",
              improvements: p.improvements || "",
              score: p.score,
              total: p.total,
            });
          });
        });
        return request({
          url: `/students/${this.studentId}/papers/batch`,
          method: "PUT",
          data: {
            date: this.data.selectedDate,
            papers: paperPayloads,
            expectedUpdatedAt: this.data.papersUpdatedAt || "",
          },
        }).then(() => data);
      })
      .then((data) => {
        this.clearLocalDraft();
        wx.showToast({ title: "已发表", icon: "success" });
        const updatedAtText = data?.updatedAt
          ? formatChinaDateTime(new Date(data.updatedAt))
          : this.data.lastUpdatedAtText;
        this.setData({
          existingId: data.id || updateId,
          editingId: null,
          isEditing: false,
          isEditable: false,
          backup: null,
          lastUpdatedAt: data.updatedAt || this.data.lastUpdatedAt,
          lastUpdatedBy: data.updatedByName || this.data.lastUpdatedBy,
          lastUpdatedAtText: updatedAtText,
        });
        wx.navigateBack();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        if (showConflictModal(err, () => this.fetchProgress())) return;
        if (err?.error === "LOSS_POINTS_REQUIRED") {
          const fields = (err.details || [])
            .map((d) => d.field)
            .filter((v, i, arr) => arr.indexOf(v) === i)
            .join("、");
          wx.showModal({
            title: "请选择失分点",
            content: `${fields ? fields + " " : ""}已填写分数，需选择至少一个失分点或填写其他失分点说明`,
            showCancel: false,
          });
          return;
        }
        if (err?.error === "ACTIVITY_NARRATIVE_REQUIRED") {
          wx.showModal({
            title: "请完善学情描述",
            content: "除英文外的科目都必须填写：学生具体做了什么、做得好的地方、需要进步的地方",
            showCancel: false,
          });
          return;
        }
        if (err?.error === "PAPER_EVALUATION_REQUIRED") {
          wx.showModal({
            title: "请完善试卷评价",
            content: "每份试卷都必须填写：做得好的地方、需要改进的地方",
            showCancel: false,
          });
          return;
        }
        if (err?.error?.includes?.("Progress already exists")) {
          wx.showToast({ title: "该日期已有记录", icon: "none" });
          return;
        }
        wx.showToast({ title: "发表失败", icon: "error" });
      })
      .finally(() => {
        this.setData({ publishing: false });
      });
  },
});
