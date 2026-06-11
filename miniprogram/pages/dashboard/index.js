const { resolveDisplayName } = require("../../utils/userIdentity");
const { request } = require("../../utils/api");
const { formatChinaDate } = require("../../utils/chinaDate");

Page({
  data: {
    userName: "",
    isTeacher: false,
    isParent: false,
    canManageStudentsAndParents: false,
    manageOpen: false,
    missingDate: "",
    selectedMissingDate: "",
    missingStudents: [],
    missingLoading: false,
    missingError: "",
    missingExpanded: false,
    weeklyMissingCycleStart: "",
    weeklyMissingCycleEnd: "",
    weeklyMissingSelectedDate: "",
    weeklyMissingSelectedWeekStart: "",
    weeklyMissingSelectedWeekEnd: "",
    weeklyMissingWeekOptions: [],
    weeklyMissingWeekLabels: [],
    weeklyMissingWeekIndex: 0,
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
    parentStudents: [],
    parentStudentsLoading: false,
    parentStudentsError: "",
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role === "admin") {
      wx.reLaunch({ url: "/pages/admin-dashboard/index" });
      return;
    }
    const isTeacher = user?.role === "teacher";
    const isParent = user?.role === "parent";
    const canManageStudentsAndParents = !!user?.canManageStudentsAndParents;
    const today = this.todayString();
    const selectedMissingDate = this.data.selectedMissingDate || today;
    const weeklyMissingSelectedDate = this.data.weeklyMissingSelectedDate || today;
    this.setData({
      userName: resolveDisplayName(user),
      isTeacher,
      isParent,
      canManageStudentsAndParents,
      selectedMissingDate,
      weeklyMissingSelectedDate,
    });
    if (isParent) {
      this.loadParentStudentsAndRedirect();
      return;
    }
    if (isTeacher) {
      this.loadMissing(selectedMissingDate);
      this.loadWeeklyMissingWeekOptions(this.data.weeklyMissingSelectedWeekStart || "")
        .then((weekStart) => this.loadWeeklyMissing(weekStart || weeklyMissingSelectedDate))
        .catch(() => this.loadWeeklyMissing(weeklyMissingSelectedDate));
      this.loadIncomplete();
      this.loadUpcomingExams();
    }
  },

  todayString() {
    return formatChinaDate(new Date());
  },

  getCurrentSunday() {
    const today = this.todayString();
    const date = new Date(`${today}T00:00:00`);
    if (Number.isNaN(date.getTime())) return today;
    const sunday = new Date(date);
    sunday.setDate(date.getDate() - date.getDay());
    const y = sunday.getFullYear();
    const m = String(sunday.getMonth() + 1).padStart(2, "0");
    const d = String(sunday.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  loadParentStudentsAndRedirect() {
    this.setData({ parentStudentsLoading: true, parentStudentsError: "" });
    request({ url: "/students" })
      .then((data) => {
        const students = Array.isArray(data) ? data : [];
        if (students.length === 1) {
          wx.reLaunch({ url: `/pages/student-detail/index?id=${students[0].id}` });
          return;
        }
        this.setData({
          parentStudents: students,
          parentStudentsLoading: false,
        });
      })
      .catch(() => {
        this.setData({
          parentStudentsLoading: false,
          parentStudentsError: "加载学生失败，请稍后重试",
        });
      });
  },

  openParentStudent(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/student-detail/index?id=${id}` });
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

  loadMissing(dateOverride) {
    const selectedDate = dateOverride || this.data.selectedMissingDate || this.todayString();
    this.setData({ missingLoading: true, missingError: "" });
    request({ url: `/daily-progress/missing?date=${encodeURIComponent(selectedDate)}` })
      .then((data) => {
        this.setData({
          selectedMissingDate: selectedDate,
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

  addDays(ymd, days) {
    const date = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    date.setDate(date.getDate() + days);
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}-${m}-${d}`;
  },

  buildSyntheticWeekOptions(anchorWeekStart) {
    const base = anchorWeekStart || this.getCurrentSunday();
    const baseDate = new Date(`${base}T00:00:00`);
    if (Number.isNaN(baseDate.getTime())) return [];
    const baseSunday = new Date(baseDate);
    baseSunday.setDate(baseDate.getDate() - baseDate.getDay());
    const options = [];
    for (let i = -26; i <= 26; i++) {
      const start = new Date(baseSunday);
      start.setDate(baseSunday.getDate() + i * 7);
      const y = start.getFullYear();
      const m = String(start.getMonth() + 1).padStart(2, "0");
      const d = String(start.getDate()).padStart(2, "0");
      const startDate = `${y}-${m}-${d}`;
      options.push({
        startDate,
        endDate: this.addDays(startDate, 6),
      });
    }
    return options;
  },

  loadWeeklyMissingWeekOptions(preferredWeekStart = "") {
    const baseWeekStart = preferredWeekStart || this.data.weeklyMissingCycleStart || this.getCurrentSunday();
    let options = this.buildSyntheticWeekOptions(baseWeekStart);
    if (baseWeekStart && !options.some((x) => x.startDate === baseWeekStart)) {
      options.unshift({ startDate: baseWeekStart, endDate: this.addDays(baseWeekStart, 6) });
    }
    options = options
      .sort((a, b) => (a.startDate > b.startDate ? -1 : 1))
      .slice(0, 60);
    const labels = options.map((item) => `${item.startDate} → ${item.endDate}`);
    const selectedStart = baseWeekStart || options[0]?.startDate || "";
    const index = Math.max(0, options.findIndex((item) => item.startDate === selectedStart));
    this.setData({
      weeklyMissingWeekOptions: options,
      weeklyMissingWeekLabels: labels,
      weeklyMissingWeekIndex: index < 0 ? 0 : index,
      weeklyMissingSelectedWeekStart: options[index]?.startDate || "",
      weeklyMissingSelectedWeekEnd: options[index]?.endDate || "",
    });
    return Promise.resolve(options[index]?.startDate || "");
  },

  loadWeeklyMissing(weekStartingOrDateOverride) {
    const weekStarting = String(weekStartingOrDateOverride || this.data.weeklyMissingSelectedWeekStart || "").slice(0, 10);
    const selectedDate = weekStarting || this.data.weeklyMissingSelectedDate || this.todayString();
    this.setData({ weeklyMissingLoading: true, weeklyMissingError: "" });
    const query = weekStarting
      ? `weekStarting=${encodeURIComponent(weekStarting)}`
      : `date=${encodeURIComponent(selectedDate)}`;
    request({ url: `/feedback/missing?${query}` })
      .then((data) => {
        const cycleStart = data?.cycle?.startDate || weekStarting || "";
        const cycleEnd = data?.cycle?.endDate || (cycleStart ? this.addDays(cycleStart, 6) : "");
        const options = this.data.weeklyMissingWeekOptions || [];
        let nextOptions = options;
        if (cycleStart && !options.some((item) => item.startDate === cycleStart)) {
          nextOptions = [{ startDate: cycleStart, endDate: cycleEnd }, ...options];
        }
        const labels = nextOptions.map((item) => `${item.startDate} → ${item.endDate}`);
        const nextIndex = Math.max(0, nextOptions.findIndex((item) => item.startDate === cycleStart));
        this.setData({
          weeklyMissingSelectedDate: selectedDate,
          weeklyMissingSelectedWeekStart: cycleStart,
          weeklyMissingSelectedWeekEnd: cycleEnd,
          weeklyMissingCycleStart: cycleStart,
          weeklyMissingCycleEnd: cycleEnd,
          weeklyMissingWeekOptions: nextOptions,
          weeklyMissingWeekLabels: labels,
          weeklyMissingWeekIndex: nextIndex < 0 ? 0 : nextIndex,
          weeklyMissingStudents: Array.isArray(data?.missing) ? data.missing : [],
          weeklyMissingLoading: false,
        });
      })
      .catch(() => this.loadWeeklyMissingFallback(weekStarting || selectedDate));
  },

  loadWeeklyMissingFallback(selectedDateOrWeekStart) {
    const selectedWeekStart = String(selectedDateOrWeekStart || this.getCurrentSunday()).slice(0, 10);
    const selectedWeekEnd = this.addDays(selectedWeekStart, 6);
    Promise.all([
      request({ url: "/students" }),
      request({ url: "/feedback" }),
    ])
      .then(([studentsData, feedbackData]) => {
        const students = Array.isArray(studentsData) ? studentsData : [];
        const cycleStart = selectedWeekStart;
        const cycleEnd = selectedWeekEnd;
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
          weeklyMissingSelectedDate: selectedWeekStart,
          weeklyMissingSelectedWeekStart: cycleStart,
          weeklyMissingSelectedWeekEnd: cycleEnd,
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

  goGradeWeeklyPlans() {
    wx.navigateTo({ url: "/pages/grade-weekly-plans/index" });
  },

  goStudentWeeklyPlanRecord() {
    wx.navigateTo({ url: "/pages/student-weekly-plan-record/index" });
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
    if (!this.data.isTeacher || !this.data.canManageStudentsAndParents) return;
    this.setData({ manageOpen: !this.data.manageOpen });
  },

  toggleMissing() {
    this.setData({ missingExpanded: !this.data.missingExpanded });
  },

  onMissingDateChange(e) {
    const date = e?.detail?.value;
    if (!date) return;
    this.loadMissing(date);
  },

  toggleWeeklyMissing() {
    this.setData({ weeklyMissingExpanded: !this.data.weeklyMissingExpanded });
  },

  onWeeklyMissingDateChange(e) {
    const index = Number(e?.detail?.value);
    const option = (this.data.weeklyMissingWeekOptions || [])[index];
    if (!option) return;
    this.setData({
      weeklyMissingWeekIndex: index,
      weeklyMissingSelectedWeekStart: option.startDate,
      weeklyMissingSelectedWeekEnd: option.endDate,
    });
    this.loadWeeklyMissing(option.startDate);
  },

  toggleIncomplete() {
    this.setData({ incompleteExpanded: !this.data.incompleteExpanded });
  },

  toggleUpcoming() {
    this.setData({ upcomingExpanded: !this.data.upcomingExpanded });
  },
});
