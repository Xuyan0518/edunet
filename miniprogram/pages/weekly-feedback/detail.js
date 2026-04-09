const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDate, formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");

const attendanceLabels = {
  present: "出席",
  late: "迟到",
  absent: "缺席",
};

const isEnglishSubject = (name = "") => {
  const lower = String(name || "").toLowerCase();
  return lower.includes("english") || String(name || "").includes("英文");
};

const buildEnglishFields = (input = {}) => ({
  editing: input.editing || "",
  vocab: input.vocab || input.vocabulary || "",
  reading: input.reading || "",
  recitation: input.recitation || input.memory || "",
  essay: input.essay || "",
});

const normalizeActivity = (activity = {}) => {
  const subjectName = activity.subjectName || activity.subject || "";
  const subjectId = activity.subjectId || "";
  const english = activity.english || activity.englishFields || {};
  const isEnglish = activity.type === "english" || isEnglishSubject(subjectName) || Object.keys(english).length > 0;
  if (isEnglish) {
    return {
      subjectId,
      subjectName,
      subjectDisplayName: formatSubjectName(subjectName || "英文"),
      type: "english",
      english: buildEnglishFields({ ...english, ...activity }),
    };
  }
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    practiceProgress: activity.practiceProgress || activity.description || "",
    definitionRecitation: activity.definitionRecitation || activity.notes || "",
  };
};

const formatProgressEntry = (entry = {}) => ({
  ...entry,
  attendanceLabel: attendanceLabels[entry.attendance] || entry.attendance || "",
  activities: (entry.activities || []).map((a) => normalizeActivity(a)),
});

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
        this.setData({ progressEntries: entries });
      })
      .catch(() => this.setData({ progressEntries: [] }))
      .finally(() => this.setData({ progressLoading: false }));
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
        if (showConflictModal(err, () => this.fetchFeedback())) return;
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },

  generateSummary() {
    if (!this.data.isEditable) return;
    if (!this.studentId || !this.data.weekStarting || !this.data.weekEnding) {
      wx.showToast({ title: "缺少周次信息", icon: "none" });
      return;
    }
    this.setData({ aiLoading: true });
    request({
      url: "/ai/weekly-summary",
      method: "POST",
      data: {
        studentId: this.studentId,
        weekStarting: this.data.weekStarting,
        weekEnding: this.data.weekEnding,
      },
    })
      .then((data) => {
        this.setData({ summary: data?.summary || "" });
        wx.showToast({ title: "已生成", icon: "success" });
      })
      .catch((err) => {
        const msg = err?.error === "AI_NOT_CONFIGURED" ? "AI未配置" : "生成失败";
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
