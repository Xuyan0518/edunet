const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDate, formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
const { showActionLockToast } = require("../../utils/actionLock");
const { LIMITS, trimText, validateDateRange } = require("../../utils/validation");

const attendanceLabels = {
  present: "出席",
  late: "迟到",
  absent: "缺席",
};

const isEnglishSubject = (name = "") => {
  const lower = String(name || "").toLowerCase();
  return lower.includes("english") || String(name || "").includes("英文") || String(name || "").includes("英语");
};

const asText = (value) => {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "object") {
    if (typeof value.text === "string" && value.text.trim()) return value.text.trim();
    if (typeof value.title === "string" && value.title.trim()) return value.title.trim();
  }
  return "";
};

const toNumberOrNull = (value) => {
  if (value === "" || value == null) return null;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const toInt = (value) => {
  const n = toNumberOrNull(value);
  if (n == null) return 0;
  return Math.max(0, Math.floor(n));
};

const formatPercent = (value) => {
  const n = toNumberOrNull(value);
  if (n == null) return "";
  return `${Math.round(n)}%`;
};

const formatScorePair = (score, total) => {
  const s = toNumberOrNull(score);
  if (s == null) return "";
  const t = toNumberOrNull(total);
  if (t == null) return String(s);
  return `${s}/${t}`;
};

const uniqText = (arr = []) =>
  [...new Set((Array.isArray(arr) ? arr : []).map((item) => asText(item)).filter(Boolean))];

const isPlainObject = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const normalizeExercises = (raw, count, fallbackScore, fallbackText) => {
  const incoming = Array.isArray(raw) ? raw : [];
  const list = incoming.map((ex) => {
    if (!isPlainObject(ex)) return { score: null, problems: "" };
    return {
      score: toNumberOrNull(ex.score),
      problems: asText(ex.problems),
    };
  });
  if (!list.length && (fallbackScore != null || fallbackText)) {
    list.push({ score: fallbackScore, problems: fallbackText });
  }
  const total = Math.max(toInt(count), list.length);
  while (list.length < total) {
    list.push({ score: null, problems: "" });
  }
  return list;
};

const normalizeScoredBlock = (raw, countKey) => {
  const source = isPlainObject(raw) ? raw : {};
  const text = asText(source.text || raw);
  const score = toNumberOrNull(source.score);
  const count = toInt(source[countKey]);
  const exercises = normalizeExercises(source.exercises, count, score, text);
  return {
    text,
    score,
    totalScore: toNumberOrNull(source.totalScore),
    [countKey]: Math.max(count, exercises.length),
    exercises,
    lossPointIds: Array.isArray(source.lossPointIds) ? source.lossPointIds : [],
    lossPointLabelsSnapshot: Array.isArray(source.lossPointLabelsSnapshot)
      ? source.lossPointLabelsSnapshot
      : [],
    otherLossPointText: asText(source.otherLossPointText),
  };
};

const normalizeSimpleBlock = (raw) => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    text: asText(source.text || raw),
  };
};

const normalizeVocabBlock = (raw) => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    text: asText(source.text || raw),
    vocabularyWordCount: toInt(source.vocabularyWordCount),
    vocabularySentenceCount: toInt(source.vocabularySentenceCount),
  };
};

const normalizeEssayBlock = (raw) => {
  const source = isPlainObject(raw) ? raw : {};
  return {
    text: asText(source.text || raw),
    title: asText(source.title),
    completed: source.completed === true,
    score: toNumberOrNull(source.score),
    totalScore: toNumberOrNull(source.totalScore),
    lossPointIds: Array.isArray(source.lossPointIds) ? source.lossPointIds : [],
    lossPointLabelsSnapshot: Array.isArray(source.lossPointLabelsSnapshot)
      ? source.lossPointLabelsSnapshot
      : [],
    otherLossPointText: asText(source.otherLossPointText),
  };
};

const summarizeExercises = (block = {}, label = "练习") => {
  const list = Array.isArray(block.exercises) ? block.exercises : [];
  const scored = list.filter((ex) => ex && ex.score !== null && ex.score !== undefined && ex.score !== "");
  if (!list.length && !scored.length) return "";
  return `${label}${list.length || scored.length}次`;
};

const buildScoredSection = ({ title, countLabel, countKey, unitLabel, block }) => {
  const source = block || {};
  const configuredCount = toInt(source[countKey]);
  const exercises = Array.isArray(source.exercises) ? source.exercises : [];
  const totalCount = Math.max(configuredCount, exercises.length);
  const list = [];
  for (let i = 0; i < totalCount; i++) {
    const ex = exercises[i] || {};
    const scoreText = formatPercent(ex.score);
    const problems = asText(ex.problems);
    list.push({
      title: `${unitLabel} ${i + 1}`,
      scoreText: scoreText || "--",
      problems,
    });
  }
  const lossPointLabels = uniqText([...(source.lossPointLabelsSnapshot || []), ...(source.lossPointIds || [])]);
  const otherLossPointText = asText(source.otherLossPointText);
  const note = asText(source.text);
  const hasData = totalCount > 0 || !!lossPointLabels.length || !!otherLossPointText || !!note || !!formatPercent(source.score);
  if (!hasData) return null;
  return {
    title,
    kind: "scored",
    countLabel,
    countValue: String(totalCount),
    list,
    note,
    lossPointLabels,
    lossPointText: lossPointLabels.join("、"),
    otherLossPointText,
  };
};

const buildEnglishSections = (english = {}, activity = {}) => {
  const sections = [];
  const editing = buildScoredSection({
    title: "改错 (Editing)",
    countLabel: "练习数",
    countKey: "exerciseCount",
    unitLabel: "练习",
    block: english.editing,
  });
  if (editing) sections.push(editing);

  const reading = buildScoredSection({
    title: "阅读理解 (Reading)",
    countLabel: "文章数",
    countKey: "articleCount",
    unitLabel: "文章",
    block: english.reading,
  });
  if (reading) sections.push(reading);

  const grammar = buildScoredSection({
    title: "语法 (Grammar)",
    countLabel: "练习数",
    countKey: "exerciseCount",
    unitLabel: "练习",
    block: english.grammar,
  });
  if (grammar) sections.push(grammar);

  const vocab = english.vocab || english.vocabulary || {};
  const vocabularyWordCount = toInt(vocab.vocabularyWordCount);
  const vocabularySentenceCount = toInt(vocab.vocabularySentenceCount);
  if (vocabularyWordCount || vocabularySentenceCount || asText(vocab)) {
    sections.push({
      title: "词汇 (Vocab)",
      kind: "kv",
      rows: [
        { label: "单词数", value: String(vocabularyWordCount) },
        { label: "句子数", value: String(vocabularySentenceCount) },
      ],
      note: asText(vocab),
    });
  }

  const recitation = english.recitation || english.memory || {};
  const recitationText = asText(recitation);
  if (recitationText) {
    sections.push({
      title: "单词句子背诵 (Recitation)",
      kind: "note",
      note: recitationText,
    });
  }

  const essay = english.essay || {};
  const essayTitle = asText(essay.title);
  const essayText = asText(essay.text || essay);
  const essayScore = formatScorePair(essay.score, essay.totalScore);
  const essayCompleted = essay.completed === true ? "已完成" : "未标记完成";
  const essayLossPointLabels = uniqText([...(essay.lossPointLabelsSnapshot || []), ...(essay.lossPointIds || [])]);
  const essayOtherLoss = asText(essay.otherLossPointText);
  if (essayTitle || essayText || essayScore || essay.completed === true || essayLossPointLabels.length || essayOtherLoss) {
    const rows = [];
    if (essayTitle) rows.push({ label: "题目", value: essayTitle });
    if (essayScore) rows.push({ label: "得分", value: essayScore });
    rows.push({ label: "完成状态", value: essayCompleted });
    sections.push({
      title: "作文 (Essay)",
      kind: "kv",
      rows,
      note: essayText,
      lossPointLabels: essayLossPointLabels,
      lossPointText: essayLossPointLabels.join("、"),
      otherLossPointText: essayOtherLoss,
    });
  }

  const canonicalKeys = new Set(["editing", "reading", "grammar", "vocab", "recitation", "essay"]);
  const customTasks = Array.isArray(activity.customEnglishTasks || activity.englishTasks)
    ? (activity.customEnglishTasks || activity.englishTasks)
    : [];
  customTasks.forEach((task) => {
    const taskKey = asText(task.key).toLowerCase();
    if (canonicalKeys.has(taskKey)) return;
    const displayName = asText(task.displayName || task.chineseName || task.englishName || task.key || "自定义项目");
    const fieldsUsed = Array.isArray(task.fieldsUsed)
      ? task.fieldsUsed
      : ["practiceCount", "score", "problems"];
    const rows = [];
    if (fieldsUsed.includes("practiceCount")) rows.push({ label: "练习数", value: String(toInt(task.practiceCount)) });
    if (fieldsUsed.includes("score")) {
      const scorePair = formatScorePair(task.score, task.maxScore);
      rows.push({ label: "分数", value: scorePair || "--" });
    }
    if (toInt(task.targetCount)) rows.push({ label: "目标次数", value: String(toInt(task.targetCount)) });
    const problems = asText(task.problems);
    if (rows.length || problems) {
      sections.push({
        title: displayName,
        kind: "kv",
        rows,
        note: problems,
      });
    }
  });

  return sections;
};

const buildGenericRows = (activity = {}) => {
  const rows = [];
  const taskSummary = asText(activity.taskSummary || activity.practiceProgress || activity.description);
  const strengths = asText(activity.strengths);
  const improvements = asText(activity.improvements);
  const comment = asText(activity.comment);
  const definitionRecitation = asText(activity.definitionRecitation || activity.notes);
  if (taskSummary) rows.push({ label: "学生具体做了什么", value: taskSummary });
  if (strengths) rows.push({ label: "做得好的地方", value: strengths });
  if (improvements) rows.push({ label: "需要进步的地方", value: improvements });
  if (definitionRecitation) rows.push({ label: "定义背诵/笔记", value: definitionRecitation });
  if (comment) rows.push({ label: "补充备注", value: comment });
  return rows;
};

const buildEnglishFields = (input = {}) => {
  const editing = normalizeScoredBlock(input.editing, "exerciseCount");
  const reading = normalizeScoredBlock(input.reading, "articleCount");
  const grammar = normalizeScoredBlock(input.grammar, "exerciseCount");
  const vocab = normalizeVocabBlock(input.vocab || input.vocabulary);
  const recitation = normalizeSimpleBlock(input.recitation || input.memory);
  const essay = normalizeEssayBlock(input.essay);

  const details = [];
  const editingSummary = summarizeExercises(editing, "改错");
  if (editingSummary) details.push({ label: "改错", value: editingSummary });
  if (asText(editing)) details.push({ label: "改错补充", value: asText(editing) });

  const readingSummary = summarizeExercises(reading, "阅读");
  if (readingSummary) details.push({ label: "阅读理解", value: readingSummary });
  if (asText(reading)) details.push({ label: "阅读补充", value: asText(reading) });

  const grammarSummary = summarizeExercises(grammar, "语法");
  if (grammarSummary) details.push({ label: "语法", value: grammarSummary });
  if (asText(grammar)) details.push({ label: "语法补充", value: asText(grammar) });

  const vocabWordCount = Number(vocab.vocabularyWordCount || 0);
  const vocabSentenceCount = Number(vocab.vocabularySentenceCount || 0);
  if (vocabWordCount || vocabSentenceCount) {
    details.push({ label: "词汇", value: `单词${vocabWordCount}个，句子${vocabSentenceCount}个` });
  } else if (asText(vocab)) {
    details.push({ label: "词汇", value: asText(vocab) });
  }

  if (asText(recitation)) details.push({ label: "单词句子背诵", value: asText(recitation) });

  const essayTitle = asText(essay.title || "");
  const essayText = asText(essay.text || essay);
  const essayScore = essay && essay.score !== null && essay.score !== undefined && essay.score !== ""
    ? `（${essay.score}${essay.totalScore ? `/${essay.totalScore}` : ""}）`
    : "";
  if (essayTitle || essayText || essayScore) {
    const essayContent = [essayTitle ? `题目：${essayTitle}` : "", essayText].filter(Boolean).join("；");
    details.push({ label: `作文${essayScore}`, value: essayContent || "已记录" });
  }

  const summary = details.slice(0, 3).map((d) => d.value).join("；") || "已记录英文学习";
  return { summary, details, editing, reading, grammar, vocab, recitation, essay };
};

const normalizePaper = (paper = {}) => {
  const score = paper.score !== null && paper.score !== undefined && paper.score !== "" ? paper.score : "-";
  const total = paper.total !== null && paper.total !== undefined && paper.total !== "" ? paper.total : "-";
  return {
    id: paper.id || "",
    date: paper.date || "",
    subjectName: paper.subjectName || "",
    subjectDisplayName: formatSubjectName(paper.subjectName || ""),
    title: `${paper.description || "试卷"} · ${score}/${total}`,
    typeName: paper.typeName || "",
    schoolName: paper.schoolName || "",
    score,
    total,
    strengths: paper.strengths || "",
    improvements: paper.improvements || "",
  };
};

const buildWeeklyPaperGroups = (papers = [], weekStarting = "", weekEnding = "") => {
  const rows = Array.isArray(papers)
    ? papers
        .map((paper) => normalizePaper(paper))
        .filter((paper) => {
          const d = String(paper.date || "");
          if (!d) return false;
          if (!weekStarting || !weekEnding) return true;
          return d >= weekStarting && d <= weekEnding;
        })
    : [];
  const grouped = new Map();
  rows.forEach((paper) => {
    const key = paper.subjectDisplayName || paper.subjectName || "未命名科目";
    const list = grouped.get(key) || [];
    list.push(paper);
    grouped.set(key, list);
  });
  return [...grouped.entries()]
    .map(([subjectDisplayName, items]) => ({
      subjectDisplayName,
      count: items.length,
      papers: items.sort((a, b) => (a.date > b.date ? -1 : 1)),
    }))
    .sort((a, b) => b.count - a.count);
};

const normalizeActivity = (activity = {}) => {
  const subjectName = activity.subjectName || activity.subject || "";
  const subjectId = activity.subjectId || "";
  const english = activity.english || activity.englishFields || {};
  const isEnglish = activity.type === "english" || isEnglishSubject(subjectName) || Object.keys(english).length > 0;
  const papers = (activity.papers || []).map((p) => normalizePaper(p));
  if (isEnglish) {
    const englishView = buildEnglishFields({ ...english, ...activity });
    const sections = buildEnglishSections(englishView, activity);
    return {
      subjectId,
      subjectName,
      subjectDisplayName: formatSubjectName(subjectName || "英文"),
      type: "english",
      summaryLine: englishView.summary,
      detailLines: englishView.details,
      sections,
      papers,
    };
  }
  const detailLines = buildGenericRows(activity);
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    summaryLine: asText(activity.taskSummary || activity.practiceProgress || activity.description || activity.strengths || activity.improvements) || "已记录",
    detailLines,
    sections: detailLines.length
      ? [{
          title: "学习明细",
          kind: "kv",
          rows: detailLines,
          note: "",
        }]
      : [],
    papers,
  };
};

const formatProgressEntry = (entry = {}) => {
  const activities = (entry.activities || []).map((a) => normalizeActivity(a));
  const subjectNames = activities.map((a) => a.subjectDisplayName || a.subjectName).filter(Boolean);
  const preview = subjectNames.slice(0, 3).join("、");
  return {
    ...entry,
    attendanceLabel: attendanceLabels[entry.attendance] || entry.attendance || "",
    activities,
    activityCount: activities.length,
    previewText: preview || "已记录学习内容",
  };
};

Page({
  data: {
    student: {},
    weekStarting: "",
    weekEnding: "",
    summary: "",
    existingId: null,
    isTeacher: false,
    isEditing: false,
    isEditable: false,
    sundayOptions: [],
    sundayIndex: 0,
    progressEntries: [],
    expandedProgressMap: {},
    progressLoading: false,
    weeklyPapersLoading: false,
    weeklyPaperGroups: [],
    aiLoading: false,
    backup: null,
    lastUpdatedAt: "",
    lastUpdatedBy: "",
    lastUpdatedAtText: "",
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    const isTeacher = user?.role === "teacher";
    this.studentId = query.studentId;
    const start = query.weekStarting || this.getCurrentSunday();

    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "error" });
      wx.navigateBack();
      return;
    }

    this.setData({
      isTeacher,
      weekStarting: start,
      weekEnding: this.addDays(start, 6),
      isEditing: !query.weekStarting && isTeacher,
      isEditable: !query.weekStarting && isTeacher,
    });

    this.buildSundayOptions(start);
    this.fetchStudent();
    this.fetchFeedback();
    this.fetchWeeklyProgress();
    this.fetchWeeklyPapers();
  },

  pad(num) {
    return String(num).padStart(2, "0");
  },

  toLocalDateString(date) {
    return `${date.getFullYear()}-${this.pad(date.getMonth() + 1)}-${this.pad(date.getDate())}`;
  },

  parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, m - 1, d);
  },

  getCurrentSunday() {
    const todayStr = formatChinaDate(new Date());
    const today = this.parseLocalDate(todayStr);
    const day = today.getDay();
    const sunday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day);
    return this.toLocalDateString(sunday);
  },

  addDays(dateStr, days) {
    const d = this.parseLocalDate(dateStr);
    d.setDate(d.getDate() + days);
    return this.toLocalDateString(d);
  },

  buildSundayOptions(baseDate) {
    const base = this.parseLocalDate(baseDate);
    const day = base.getDay();
    const sunday = new Date(base.getFullYear(), base.getMonth(), base.getDate() - day);
    const options = [];
    for (let i = -26; i <= 26; i++) {
      const d = new Date(sunday);
      d.setDate(sunday.getDate() + i * 7);
      options.push(this.toLocalDateString(d));
    }
    if (!options.includes(baseDate)) options.unshift(baseDate);
    const sundayIndex = options.indexOf(baseDate);
    this.setData({ sundayOptions: options, sundayIndex });
  },

  syncSundayIndex(dateStr) {
    let options = this.data.sundayOptions || [];
    if (!options.includes(dateStr)) {
      options = [dateStr, ...options];
    }
    this.setData({ sundayOptions: options, sundayIndex: options.indexOf(dateStr) });
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((data) => this.setData({ student: data }))
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchFeedback() {
    wx.request({
      url: `${getApp().globalData.apiBaseUrl}/feedback/one?studentId=${this.studentId}&weekStarting=${this.data.weekStarting}`,
      header: {
        Authorization: `Bearer ${wx.getStorageSync("token")}`,
      },
      success: (res) => {
        if (res.statusCode === 404) {
          if (this.data.isTeacher) {
            this.setData({
              isEditing: true,
              isEditable: true,
              existingId: null,
              backup: null,
              lastUpdatedAt: "",
              lastUpdatedBy: "",
              lastUpdatedAtText: "",
            });
          }
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const entry = res.data;
          if (!entry || !entry.id) {
            if (this.data.isTeacher) {
              this.setData({
                isEditing: true,
                isEditable: true,
                existingId: null,
                backup: null,
                lastUpdatedAt: "",
                lastUpdatedBy: "",
                lastUpdatedAtText: "",
              });
            }
            return;
          }
          this.syncSundayIndex(entry.weekStarting);
          const updatedAtText = entry.updatedAt
            ? formatChinaDateTime(new Date(entry.updatedAt))
            : "";
          this.setData({
            existingId: entry.id,
            summary: entry.summary || "",
            weekEnding: entry.weekEnding || this.data.weekEnding,
            isEditing: false,
            isEditable: false,
            backup: null,
            lastUpdatedAt: entry.updatedAt || "",
            lastUpdatedBy: entry.updatedByName || "",
            lastUpdatedAtText: updatedAtText,
          });
          this.fetchWeeklyProgress();
          this.fetchWeeklyPapers();
        } else {
          wx.showToast({ title: "获取反馈失败", icon: "error" });
        }
      },
      fail: () => wx.showToast({ title: "获取反馈失败", icon: "error" }),
    });
  },

  onSundayPick(e) {
    if (!this.data.isEditable) return;
    const index = Number(e.detail.value);
    const weekStarting = this.data.sundayOptions[index];
    if (!weekStarting) return;
    const weekEnding = this.addDays(weekStarting, 6);
    // Changing week should load existing record if available; otherwise start a new blank record.
    this.setData({
      weekStarting,
      weekEnding,
      sundayIndex: index,
      existingId: null,
      summary: "",
      isEditing: false,
      isEditable: false,
      backup: null,
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      lastUpdatedAtText: "",
    });
    this.fetchFeedback();
    this.fetchWeeklyProgress();
    this.fetchWeeklyPapers();
  },

  onFieldInput(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  startEdit() {
    this.setData({
      isEditing: true,
      isEditable: true,
      backup: {
        weekStarting: this.data.weekStarting,
        weekEnding: this.data.weekEnding,
        summary: this.data.summary,
        existingId: this.data.existingId,
      },
    });
  },

  cancelEdit() {
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
      weekStarting: backup.weekStarting,
      weekEnding: backup.weekEnding,
      summary: backup.summary,
      existingId: backup.existingId,
      isEditing: false,
      isEditable: false,
      backup: null,
    });
    this.syncSundayIndex(backup.weekStarting);
  },

  fetchWeeklyProgress() {
    if (!this.studentId) return;
    const start = this.data.weekStarting;
    const end = this.data.weekEnding;
    this.setData({ progressLoading: true });
    request({ url: `/progress/list?studentId=${this.studentId}` })
      .then((data) => {
        const entries = (data || [])
          .filter((entry) => {
            const date = entry.date || "";
            return date >= start && date <= end;
          })
          .map((entry) => formatProgressEntry(entry))
          .sort((a, b) => (a.date > b.date ? 1 : -1));
        const currentMap = { ...(this.data.expandedProgressMap || {}) };
        const nextMap = {};
        entries.forEach((entry, idx) => {
          const key = entry.id || entry.date;
          if (currentMap[key] !== undefined) nextMap[key] = currentMap[key];
          else nextMap[key] = idx === entries.length - 1; // default expand latest day
        });
        this.setData({ progressEntries: entries, expandedProgressMap: nextMap });
      })
      .catch(() => this.setData({ progressEntries: [] }))
      .finally(() => this.setData({ progressLoading: false }));
  },

  fetchWeeklyPapers() {
    if (!this.studentId) return;
    this.setData({ weeklyPapersLoading: true });
    request({ url: `/students/${this.studentId}/papers` })
      .then((rows) => {
        const weeklyPaperGroups = buildWeeklyPaperGroups(
          rows || [],
          this.data.weekStarting,
          this.data.weekEnding
        );
        this.setData({ weeklyPaperGroups });
      })
      .catch(() => this.setData({ weeklyPaperGroups: [] }))
      .finally(() => this.setData({ weeklyPapersLoading: false }));
  },

  toggleProgressEntry(e) {
    const key = e?.currentTarget?.dataset?.key;
    if (!key) return;
    const map = { ...(this.data.expandedProgressMap || {}) };
    map[key] = !map[key];
    this.setData({ expandedProgressMap: map });
  },

  deleteEntry() {
    if (!this.data.existingId) return;
    wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确定继续？",
      success: (res) => {
        if (!res.confirm) return;
        const updatedAt = encodeURIComponent(this.data.lastUpdatedAt || "");
        request({ url: `/feedback/${this.data.existingId}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            wx.navigateBack();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            if (showConflictModal(err, () => this.fetchFeedback())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },

  save() {
    if (!this.data.isEditable) return;

    if (!this.data.summary.trim()) {
      wx.showToast({ title: "请填写总结", icon: "none" });
      return;
    }
    const summaryLen = trimText(this.data.summary).length;
    if (summaryLen > LIMITS.summaryMax) {
      wx.showToast({ title: `总结过长（最多 ${LIMITS.summaryMax} 字）`, icon: "none" });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate: this.data.weekStarting,
      endDate: this.data.weekEnding,
      maxDays: LIMITS.weeklyRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: "none" });
      return;
    }

    const checkConflict = () =>
      new Promise((resolve) => {
        wx.request({
          url: `${getApp().globalData.apiBaseUrl}/feedback/one?studentId=${this.studentId}&weekStarting=${this.data.weekStarting}`,
          header: {
            Authorization: `Bearer ${wx.getStorageSync("token")}`,
          },
          success: (res) => {
            if (res.statusCode === 200 && res.data?.id && res.data.id !== this.data.existingId) {
              resolve({ conflict: true });
              return;
            }
            resolve({ conflict: false });
          },
          fail: () => resolve({ conflict: false }),
        });
      });

    if (this.data.existingId) {
      checkConflict().then((result) => {
        if (result.conflict) {
          wx.showToast({ title: "该周已有反馈", icon: "none" });
          return;
        }
        this.persist();
      });
      return;
    }

    this.persist();
  },

  persist() {
    
    const payload = {
      studentId: this.studentId,
      weekStarting: this.data.weekStarting,
      weekEnding: this.data.weekEnding,
      summary: this.data.summary || "",
      strengths: [],
      areasToImprove: [],
      teacherNotes: "",
      nextWeekFocus: "",
    };

    const requestConfig = this.data.existingId
      ? {
          url: `/feedback/${this.data.existingId}`,
          method: "PUT",
          data: { ...payload, updatedAt: this.data.lastUpdatedAt },
        }
      : { url: "/feedback", method: "POST", data: payload };

    request(requestConfig)
      .then((data) => {
        wx.showToast({ title: "已保存", icon: "success" });
        const updatedAtText = data?.updatedAt
          ? formatChinaDateTime(new Date(data.updatedAt))
          : this.data.lastUpdatedAtText;
        this.setData({
          existingId: data.id || this.data.existingId,
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
        if (showConflictModal(err, () => this.fetchFeedback())) return;
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },

  generateSummary() {
    if (!this.data.isEditable) return;
    if (!this.studentId || !this.data.weekStarting) {
      wx.showToast({ title: "缺少周次信息", icon: "none" });
      return;
    }
    const weekEnding = this.data.weekEnding || this.addDays(this.data.weekStarting, 6);
    this.setData({ aiLoading: true });
    request({
      url: "/ai/weekly-summary",
      method: "POST",
      data: {
        studentId: this.studentId,
        weekStarting: this.data.weekStarting,
        weekEnding,
      },
    })
      .then((data) => {
        this.setData({ summary: data?.summary || "" });
        wx.showToast({ title: "已生成", icon: "success" });
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        const msg = err?.error === "AI_NOT_CONFIGURED"
          ? "AI未配置"
          : err?.message || err?.error || "生成失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ aiLoading: false }));
  },

  openSummaryView() {
    wx.setStorageSync("report_view_payload", {
      title: "每周汇报",
      subtitle: `${this.data.student?.name || ""} · ${this.data.weekStarting} - ${this.data.weekEnding}`,
      content: this.data.summary || "",
    });
    wx.navigateTo({ url: "/pages/report-view/index" });
  },
});
