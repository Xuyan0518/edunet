const { request } = require("../../utils/api");
const { resolveDisplayName, resolveIdentityHint } = require("../../utils/userIdentity");

const shortDate = (value) => (value ? String(value).slice(0, 10) : "暂无");

const csvEscape = (value) => {
  const text = value == null ? "" : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

const toCsv = (rows) => {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  return [
    headers.map(csvEscape).join(","),
    ...rows.map((row) => headers.map((header) => csvEscape(row[header])).join(",")),
  ].join("\n");
};

const decorateStudent = (student) => {
  const stats = student.stats || {};
  return {
    ...student,
    parentName: student.parent?.displayName || student.parent?.name || "未绑定家长",
    parentHint: student.parent?.wechatOpenIdMasked || student.parent?.email || "",
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
      !student.parentId ? "未绑家长" : "",
    ].filter(Boolean).join(" · ") || "正常",
    statusClass: stats.missingDailyToday || stats.missingCurrentWeekly ? "chip-warning" : "chip-success",
  };
};

const decorateUser = (user) => ({
  ...user,
  displayLabel: resolveDisplayName(user),
  identityLabel: resolveIdentityHint(user),
});

Page({
  data: {
    loading: true,
    dashboard: null,
    metrics: {},
    currentCycleText: "",
    students: [],
    filteredStudents: [],
    selectedStudent: null,
    selectedStudentId: "",
    parents: [],
    parentNames: ["不绑定家长"],
    parentIds: [""],
    pendingParents: [],
    pendingTeachers: [],
    pendingAccessCount: 0,
    teachers: [],
    filteredTeachers: [],
    studentQuery: "",
    statusFilter: "all",
    statusFilterOptions: ["全部学生", "缺今日记录", "缺本周反馈", "未绑定家长"],
    gradeOptions: ["全部年级"],
    gradeFilterIndex: 0,
    teacherQuery: "",
    editStudentName: "",
    editStudentGrade: "",
    editParentIndex: 0,
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
        const parents = (data?.access?.parents || []).map(decorateUser);
        const teachers = (data?.access?.teachers || []).map(decorateUser);
        const parentNames = ["不绑定家长"].concat(parents.map((p) => p.displayLabel));
        const parentIds = [""].concat(parents.map((p) => p.id));
        const gradeOptions = ["全部年级"].concat(Array.from(new Set(students.map((s) => s.grade).filter(Boolean))).sort());
        const selected = students.find((s) => s.id === this.data.selectedStudentId) || students[0] || null;

        this.setData({
          dashboard: data,
          metrics: data?.metrics || {},
          currentCycleText: data?.currentCycle ? `${data.currentCycle.startDate} 至 ${data.currentCycle.endDate}` : "",
          students,
          parents,
          parentNames,
          parentIds,
          pendingParents: (data?.access?.pendingParents || []).map(decorateUser),
          pendingTeachers: (data?.access?.pendingTeachers || []).map(decorateUser),
          pendingAccessCount: (data?.metrics?.pendingParents || 0) + (data?.metrics?.pendingTeachers || 0),
          teachers,
          filteredTeachers: this.filterTeachers(teachers, this.data.teacherQuery),
          gradeOptions,
          selectedStudent: selected,
          selectedStudentId: selected?.id || "",
        });
        this.syncEditForm(selected);
        this.applyStudentFilters();
      })
      .catch(() => wx.showToast({ title: "获取管理数据失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  syncEditForm(student) {
    const parentIndex = student?.parentId ? Math.max(0, this.data.parentIds.indexOf(student.parentId)) : 0;
    this.setData({
      editStudentName: student?.name || "",
      editStudentGrade: student?.grade || "",
      editParentIndex: parentIndex < 0 ? 0 : parentIndex,
    });
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
        (status === "noParent" && !student.parentId);
      return matchesQuery && matchesGrade && matchesStatus;
    });
    this.setData({ filteredStudents: filtered });
  },

  filterTeachers(teachers, query) {
    const normalized = (query || "").trim().toLowerCase();
    if (!normalized) return teachers;
    return teachers.filter((teacher) =>
      [teacher.displayLabel, teacher.identityLabel, teacher.status]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
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

  selectStudent(e) {
    const id = e.currentTarget.dataset.id;
    const selected = this.data.students.find((student) => student.id === id) || null;
    this.setData({ selectedStudent: selected, selectedStudentId: id });
    this.syncEditForm(selected);
  },

  onEditName(e) {
    this.setData({ editStudentName: e.detail.value || "" });
  },

  onEditGrade(e) {
    this.setData({ editStudentGrade: e.detail.value || "" });
  },

  onParentChange(e) {
    this.setData({ editParentIndex: Number(e.detail.value || 0) });
  },

  saveStudentProfile() {
    const student = this.data.selectedStudent;
    if (!student) return;
    const name = (this.data.editStudentName || "").trim();
    const grade = (this.data.editStudentGrade || "").trim();
    if (!name || !grade) {
      wx.showToast({ title: "姓名和年级必填", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    request({
      url: `/students/${student.id}`,
      method: "PUT",
      data: {
        name,
        grade,
        parentId: this.data.parentIds[this.data.editParentIndex] || null,
      },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.fetchAll();
      })
      .catch(() => wx.showToast({ title: "保存失败", icon: "error" }))
      .finally(() => wx.hideLoading());
  },

  handleApprove(e) {
    const { id, role } = e.currentTarget.dataset;
    request({ url: "/admin/approve", method: "POST", data: { id, role } })
      .then(() => {
        wx.showToast({ title: "已批准", icon: "success" });
        return this.fetchAll();
      })
      .catch(() => wx.showToast({ title: "操作失败", icon: "error" }));
  },

  handleReject(e) {
    const { id, role } = e.currentTarget.dataset;
    request({ url: "/admin/reject", method: "POST", data: { id, role } })
      .then(() => {
        wx.showToast({ title: "已拒绝", icon: "success" });
        return this.fetchAll();
      })
      .catch(() => wx.showToast({ title: "操作失败", icon: "error" }));
  },

  onSearchTeacher(e) {
    const teacherQuery = e.detail.value || "";
    this.setData({
      teacherQuery,
      filteredTeachers: this.filterTeachers(this.data.teachers, teacherQuery),
    });
  },

  deleteTeacher(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认删除",
      content: "删除教师账号会影响其学生数据，确定继续？",
      success: (res) => {
        if (!res.confirm) return;
        request({ url: `/teachers/${id}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchAll();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "error" }));
      },
    });
  },

  goStudentDetail() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/student-detail/index?id=${this.data.selectedStudentId}` });
  },

  goDailyProgress() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/daily-progress/detail?studentId=${this.data.selectedStudentId}` });
  },

  goWeeklyFeedback() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/weekly-feedback/detail?studentId=${this.data.selectedStudentId}` });
  },

  goReports() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/reports/index?studentId=${this.data.selectedStudentId}` });
  },

  goQuarterly() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/quarterly-summary/index?studentId=${this.data.selectedStudentId}` });
  },

  goYearly() {
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({ url: `/pages/yearly-summary/index?studentId=${this.data.selectedStudentId}` });
  },

  exportStudents() {
    const rows = this.data.filteredStudents.map((student) => ({
      studentId: student.id,
      name: student.name,
      grade: student.grade,
      parent: student.parentName,
      dailyRecords: student.dailyCount,
      weeklyRecords: student.weeklyCount,
      termRecords: student.termCount,
      yearlyRecords: student.yearlyCount,
      reports: student.reportCount,
      latestDaily: student.latestDailyText,
      latestWeekly: student.latestWeeklyText,
      status: student.statusText,
    }));
    this.copyCsv("已复制学生列表 CSV", rows);
  },

  exportSelectedStudent() {
    const student = this.data.selectedStudent;
    if (!student) return;
    const rows = []
      .concat((student.dailyProgress || []).map((r) => ({
        type: "daily",
        date: shortDate(r.date),
        endDate: "",
        title: r.attendance || "",
        summary: r.summary || "",
      })))
      .concat((student.weeklyFeedback || []).map((r) => ({
        type: "weekly",
        date: shortDate(r.weekStarting),
        endDate: shortDate(r.weekEnding),
        title: r.nextWeekFocus || "",
        summary: r.summary || "",
      })))
      .concat((student.quarterlySummaries || []).map((r) => ({
        type: "term",
        date: `${r.year} Q${r.quarter}`,
        endDate: "",
        title: "",
        summary: r.summary || "",
      })))
      .concat((student.yearlySummaries || []).map((r) => ({
        type: "yearly",
        date: r.year,
        endDate: "",
        title: "",
        summary: r.summary || "",
      })))
      .concat((student.reports || []).map((r) => ({
        type: r.reportType || "report",
        date: shortDate(r.startDate),
        endDate: shortDate(r.endDate),
        title: r.title || "",
        summary: r.summaryText || "",
      })));
    this.copyCsv(`已复制 ${student.name} 数据 CSV`, rows);
  },

  copyCsv(title, rows) {
    if (!rows.length) {
      wx.showToast({ title: "暂无可导出数据", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: toCsv(rows),
      success: () => wx.showToast({ title, icon: "success" }),
    });
  },
});
