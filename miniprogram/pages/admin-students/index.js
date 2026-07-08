const { request } = require("../../utils/api");

const shortDate = (value) => (value ? String(value).slice(0, 10) : "暂无");

const decorateStudent = (student) => {
  const stats = student.stats || {};
  const parentIds = Array.isArray(student.parentIds) ? student.parentIds : (student.parentId ? [student.parentId] : []);
  const parents = Array.isArray(student.parents) ? student.parents : (student.parent ? [student.parent] : []);
  return {
    ...student,
    parentIds,
    parentName: parents.length
      ? parents.map((parent) => parent.displayName || parent.name || "未命名家长").join("、")
      : "未绑定家长",
    parentHint: parents.map((parent) => parent.wechatOpenIdMasked || parent.email || "").filter(Boolean).join("、"),
    latestDailyText: shortDate(stats.latestDailyDate),
    latestWeeklyText: shortDate(stats.latestWeeklyStart),
    latestReportText: stats.latestReportTitle || "暂无报告",
    dailyCount: stats.dailyCount || 0,
    weeklyCount: stats.weeklyCount || 0,
    termCount: stats.quarterlyCount || 0,
    yearlyCount: stats.yearlyCount || 0,
    reportCount: stats.reportCount || 0,
    missingDailyToday: !!stats.missingDailyToday,
    missingCurrentWeekly: !!stats.missingCurrentWeekly,
    statusText: [
      stats.missingDailyToday ? "缺今日记录" : "",
      stats.missingCurrentWeekly ? "缺本周反馈" : "",
      !parentIds.length ? "未绑家长" : "",
    ].filter(Boolean).join(" · ") || "正常",
    statusClass: stats.missingDailyToday || stats.missingCurrentWeekly ? "chip-warning" : "chip-success",
  };
};

Page({
  data: {
    loading: true,
    students: [],
    filteredStudents: [],
    studentQuery: "",
    statusFilter: "all",
    gradeOptions: ["全部年级"],
    gradeFilterIndex: 0,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchAll();
  },

  fetchAll() {
    this.setData({ loading: true });
    return request({ url: "/admin/student-management" })
      .then((data) => {
        const students = (data?.students || []).map(decorateStudent);
        const gradeOptions = ["全部年级"].concat(Array.from(new Set(students.map((s) => s.grade).filter(Boolean))).sort());
        this.setData({
          students,
          gradeOptions,
        });
        this.applyStudentFilters();
      })
      .catch(() => wx.showToast({ title: "获取学生数据失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  applyStudentFilters() {
    const query = (this.data.studentQuery || "").trim().toLowerCase();
    const grade = this.data.gradeOptions[this.data.gradeFilterIndex] || "全部年级";
    const status = this.data.statusFilter;
    const filtered = this.data.students.filter((student) => {
      const matchesQuery = !query || [student.name, student.grade, student.parentName, student.parentHint]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query));
      const matchesGrade = grade === "全部年级" || student.grade === grade;
      const matchesStatus =
        status === "all" ||
        (status === "missingDaily" && student.missingDailyToday) ||
        (status === "missingWeekly" && student.missingCurrentWeekly) ||
        (status === "noParent" && !(student.parentIds || []).length);
      return matchesQuery && matchesGrade && matchesStatus;
    });
    this.setData({ filteredStudents: filtered });
  },

  onSearchStudent(e) {
    this.setData({ studentQuery: e.detail.value || "" });
    this.applyStudentFilters();
  },

  onGradeFilterChange(e) {
    this.setData({ gradeFilterIndex: Number(e.detail.value || 0) });
    this.applyStudentFilters();
  },

  setStatusFilter(e) {
    this.setData({ statusFilter: e.currentTarget.dataset.value || "all" });
    this.applyStudentFilters();
  },

  openStudent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/admin-student-detail/index?studentId=${id}` });
  },
});
