const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDate, formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
const { showActionLockToast } = require("../../utils/actionLock");

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

const summarizeExercises = (block = {}, label = "练习") => {
  const list = Array.isArray(block.exercises) ? block.exercises : [];
  const scored = list.filter((ex) => ex && ex.score !== null && ex.score !== undefined && ex.score !== "");
  if (!list.length && !scored.length) return "";
  const avg =
    scored.length > 0
      ? Math.round(
          scored.reduce((sum, ex) => sum + Number(ex.score || 0), 0) / scored.length
        )
      : null;
  if (avg === null) return `${label}${list.length || scored.length}次`;
  return `${label}${list.length || scored.length}次，平均${avg}%`;
};

const buildEnglishFields = (input = {}) => {
  const editing = input.editing || {};
  const reading = input.reading || {};
  const grammar = input.grammar || {};
  const vocab = input.vocab || input.vocabulary || {};
  const recitation = input.recitation || input.memory || {};
  const essay = input.essay || {};

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
  return { summary, details };
};

const normalizePaper = (paper = {}) => {
  const score = paper.score !== null && paper.score !== undefined && paper.score !== "" ? paper.score : "-";
  const total = paper.total !== null && paper.total !== undefined && paper.total !== "" ? paper.total : "-";
  return {
    title: `${paper.description || "试卷"} · ${score}/${total}`,
    typeName: paper.typeName || "",
    schoolName: paper.schoolName || "",
    strengths: paper.strengths || "",
    improvements: paper.improvements || "",
  };
};

const normalizeActivity = (activity = {}) => {
  const subjectName = activity.subjectName || activity.subject || "";
  const subjectId = activity.subjectId || "";
  const english = activity.english || activity.englishFields || {};
  const isEnglish = activity.type === "english" || isEnglishSubject(subjectName) || Object.keys(english).length > 0;
  const papers = (activity.papers || []).map((p) => normalizePaper(p));
  if (isEnglish) {
    const englishView = buildEnglishFields({ ...english, ...activity });
    return {
      subjectId,
      subjectName,
      subjectDisplayName: formatSubjectName(subjectName || "英文"),
      type: "english",
      summaryLine: englishView.summary,
      detailLines: englishView.details,
      papers,
    };
  }
  const taskSummary = activity.taskSummary || activity.practiceProgress || activity.description || "";
  const strengths = activity.strengths || "";
  const improvements = activity.improvements || "";
  const detailLines = [];
  if (taskSummary) detailLines.push({ label: "学生具体做了什么", value: taskSummary });
  if (strengths) detailLines.push({ label: "做得好的地方", value: strengths });
  if (improvements) detailLines.push({ label: "需要进步的地方", value: improvements });
  if (!detailLines.length && activity.practiceProgress) {
    detailLines.push({ label: "练习进度", value: activity.practiceProgress });
  }
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    summaryLine: taskSummary || strengths || improvements || "已记录",
    detailLines,
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
