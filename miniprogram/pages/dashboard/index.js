const { resolveDisplayName } = require("../../utils/userIdentity");
const { request } = require("../../utils/api");

Page({
  data: {
    userName: "",
    isTeacher: false,
    manageOpen: false,
    missingDate: "",
    missingStudents: [],
    missingLoading: false,
    missingError: "",
    missingExpanded: false,
    weeklyMissingCycleStart: "",
    weeklyMissingCycleEnd: "",
    weeklyMissingStudents: [],
    weeklyMissingLoading: false,
    weeklyMissingError: "",
    weeklyMissingExpanded: false,
    incompleteCycleStart: "",
    incompleteCycleEnd: "",
    incompleteStudents: [],
    incompleteLoading: false,
    incompleteError: "",
    incompleteExpanded: false,
    upcomingExams: [],
    upcomingLoading: false,
    upcomingError: "",
    upcomingExpanded: false,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role === "admin") {
      wx.reLaunch({ url: "/pages/admin-dashboard/index" });
      return;
    }
    const isTeacher = user?.role === "teacher";
    this.setData({
      userName: resolveDisplayName(user),
      isTeacher,
    });
    if (isTeacher) {
      this.loadMissing();
      this.loadWeeklyMissing();
      this.loadIncomplete();
      this.loadUpcomingExams();
    }
  },

  loadUpcomingExams() {
    this.setData({ upcomingLoading: true, upcomingError: "" });
    request({ url: "/exams/upcoming" })
      .then((data) => {
        const trimDate = (v) => (typeof v === "string" ? v.slice(0, 10) : "");
        const upcoming = (data?.upcoming || []).map((e, i) => {
          const subj = e.subject || {};
          const subjectDate = trimDate(subj.examDate);
          return {
            id: `${e.id}-${subj.name}-${i}`,
            title: `${e.student?.name || ""} · ${subj.name || ""}`,
            subtitle:
              `${e.name}${e.examType ? " (" + e.examType + ")" : ""} · ` +
              subjectDate +
              " · " +
              (e.daysUntil > 0
                ? `还有 ${e.daysUntil} 天`
                : e.daysUntil === 0
                ? "今天"
                : `已过 ${-e.daysUntil} 天`),
            subjects: subj.scope || "",
          };
        });
        this.setData({ upcomingExams: upcoming, upcomingLoading: false });
      })
      .catch(() => this.setData({ upcomingLoading: false, upcomingError: "加载失败" }));
  },

  loadIncomplete() {
    this.setData({ incompleteLoading: true, incompleteError: "" });
    request({ url: "/weekly-tasks/incomplete" })
      .then((data) => {
        const incomplete = Array.isArray(data?.incomplete) ? data.incomplete : [];
        const summarized = incomplete.map((s) => {
          const c = s.completion || {};
          const parts = [];
          if (c.reading && !c.reading.met) parts.push(`阅读 ${c.reading.completed}/${c.reading.target}`);
          if (c.editing && c.editing.required && !c.editing.met) parts.push(`改错 ${c.editing.completed}/${c.editing.target}`);
          if (c.grammar && c.grammar.required && !c.grammar.met) parts.push(`语法 ${c.grammar.completed}/${c.grammar.target}`);
          if (c.vocab && !c.vocab.met) parts.push(`词汇 ${c.vocab.completed}/${c.vocab.target}`);
          if (c.composition && !c.composition.met) parts.push(`作文 ${c.composition.completed}/${c.composition.target}`);
          return { id: s.id, name: s.name, grade: s.grade, unmet: parts.join("、") };
        });
        this.setData({
          incompleteCycleStart: data?.cycle?.startDate || "",
          incompleteCycleEnd: data?.cycle?.endDate || "",
          incompleteStudents: summarized,
          incompleteLoading: false,
        });
      })
      .catch(() => {
        this.setData({ incompleteLoading: false, incompleteError: "加载失败" });
      });
  },

  loadMissing() {
    this.setData({ missingLoading: true, missingError: "" });
    request({ url: "/daily-progress/missing" })
      .then((data) => {
        this.setData({
          missingDate: data?.date || "",
          missingStudents: Array.isArray(data?.missing) ? data.missing : [],
          missingLoading: false,
        });
      })
      .catch(() => {
        this.setData({
          missingLoading: false,
          missingError: "加载失败",
        });
      });
  },

  loadWeeklyMissing() {
    this.setData({ weeklyMissingLoading: true, weeklyMissingError: "" });
    request({ url: "/feedback/missing" })
      .then((data) => {
        this.setData({
          weeklyMissingCycleStart: data?.cycle?.startDate || "",
          weeklyMissingCycleEnd: data?.cycle?.endDate || "",
          weeklyMissingStudents: Array.isArray(data?.missing) ? data.missing : [],
          weeklyMissingLoading: false,
        });
      })
      .catch(() => this.loadWeeklyMissingFallback());
  },

  loadWeeklyMissingFallback() {
    Promise.all([
      request({ url: "/students" }),
      request({ url: "/weekly-tasks/incomplete" }),
      request({ url: "/feedback" }),
    ])
      .then(([studentsData, cycleData, feedbackData]) => {
        const students = Array.isArray(studentsData) ? studentsData : [];
        const cycleStart = cycleData?.cycle?.startDate || "";
        const cycleEnd = cycleData?.cycle?.endDate || "";
        const feedbackList = Array.isArray(feedbackData) ? feedbackData : [];

        const submittedIds = new Set(
          feedbackList
            .filter((f) => f?.weekStarting === cycleStart)
            .map((f) => f?.studentId)
            .filter(Boolean),
        );

        const missing = students
          .filter((s) => s?.id && !submittedIds.has(s.id))
          .map((s) => ({ id: s.id, name: s.name || "", grade: s.grade || "" }))
          .sort((a, b) => a.name.localeCompare(b.name));

        this.setData({
          weeklyMissingCycleStart: cycleStart,
          weeklyMissingCycleEnd: cycleEnd,
          weeklyMissingStudents: missing,
          weeklyMissingLoading: false,
        });
      })
      .catch(() => {
        this.setData({
          weeklyMissingLoading: false,
          weeklyMissingError: "加载失败",
        });
      });
  },

  goRecordMissing(e) {
    const id = e?.currentTarget?.dataset?.id;
    const date = this.data.missingDate;
    if (!id) return;
    wx.navigateTo({
      url: `/pages/daily-progress/detail?studentId=${encodeURIComponent(id)}&date=${encodeURIComponent(date)}`,
    });
  },

  goRecordWeeklyMissing(e) {
    const id = e?.currentTarget?.dataset?.id;
    const weekStarting = this.data.weeklyMissingCycleStart;
    if (!id || !weekStarting) return;
    wx.navigateTo({
      url: `/pages/weekly-feedback/detail?studentId=${encodeURIComponent(id)}&weekStarting=${encodeURIComponent(weekStarting)}`,
    });
  },

  goStudents() {
    wx.navigateTo({ url: "/pages/students/index" });
  },

  goDaily() {
    wx.navigateTo({ url: "/pages/daily-progress/index" });
  },

  goWeekly() {
    wx.navigateTo({ url: "/pages/weekly-feedback/index" });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goParents() {
    wx.navigateTo({ url: "/pages/parents/index" });
  },

  goStudentsManage() {
    wx.navigateTo({ url: "/pages/students-manage/index" });
  },

  toggleManage() {
    if (!this.data.isTeacher) return;
    this.setData({ manageOpen: !this.data.manageOpen });
  },

  toggleMissing() {
    this.setData({ missingExpanded: !this.data.missingExpanded });
  },

  toggleWeeklyMissing() {
    this.setData({ weeklyMissingExpanded: !this.data.weeklyMissingExpanded });
  },

  toggleIncomplete() {
    this.setData({ incompleteExpanded: !this.data.incompleteExpanded });
  },

  toggleUpcoming() {
    this.setData({ upcomingExpanded: !this.data.upcomingExpanded });
  },
});
