const { request } = require("../../utils/api");
const { formatChinaDate } = require("../../utils/chinaDate");

Page({
  data: {
    students: [],
    filteredStudents: [],
    studentNames: [],
    loadingStudents: true,
    query: "",
    gradeOptions: ["全部年级"],
    gradeIndex: 0,
    selectedStudentId: "",
    selectedStudentName: "",
    entries: [],
    filteredEntries: [],
    pagedEntries: [],
    isTeacher: false,
    filterMode: "all",
    filterMonth: "",
    pageSize: 10,
    currentPage: 1,
    totalPages: 1,
    lockStudent: false,
  },

  onLoad(query) {
    const today = this.today();
    this.presetStudentId = query.studentId || "";
    this.setData({
      filterMonth: today.slice(0, 7),
      lockStudent: !!query.studentId,
    });
  },

  onShow() {
    const user = wx.getStorageSync("user");
    this.setData({ isTeacher: user?.role === "teacher" });
    this.fetchStudents();
  },

  fetchStudents() {
    this.setData({ loadingStudents: true });
    request({ url: "/students" })
      .then((data) => {
        const students = data || [];
        const names = students.map((s) => s.name);
        const gradeOptions = ["全部年级"].concat(
          Array.from(new Set(students.map((s) => String(s.grade || "").trim()).filter(Boolean))).sort()
        );
        this.setData({ students, studentNames: names, gradeOptions }, () => this.applyStudentFilters());

        if (this.presetStudentId) {
          const preset = students.find((s) => s.id === this.presetStudentId);
          if (preset) {
            this.setData({
              selectedStudentId: preset.id,
              selectedStudentName: preset.name,
            });
            this.fetchFeedback(preset.id);
          }
          return;
        }

        if (this.data.selectedStudentId) {
          const selected = students.find((s) => s.id === this.data.selectedStudentId);
          if (selected) {
            this.setData({ selectedStudentName: selected.name });
            this.fetchFeedback(selected.id);
          }
          return;
        }
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }))
      .finally(() => this.setData({ loadingStudents: false }));
  },

  onStudentChange(e) {
    if (this.data.lockStudent) return;
    const index = e.detail.value;
    const student = this.data.students[index];
    if (!student) return;
    this.setData({
      selectedStudentId: student.id,
      selectedStudentName: student.name,
      currentPage: 1,
    });
    this.fetchFeedback(student.id);
  },

  onSearchStudent(e) {
    this.setData({ query: e.detail.value || "" }, () => this.applyStudentFilters());
  },

  onGradeChange(e) {
    this.setData({ gradeIndex: Number(e.detail.value || 0) }, () => this.applyStudentFilters());
  },

  applyStudentFilters() {
    const query = (this.data.query || "").trim().toLowerCase();
    const grade = this.data.gradeOptions[this.data.gradeIndex] || "全部年级";
    const filteredStudents = (this.data.students || []).filter((student) => {
      const nameMatch = !query || String(student.name || "").toLowerCase().includes(query);
      const gradeValue = String(student.grade || "").trim();
      const gradeMatch = grade === "全部年级" || gradeValue === grade;
      return nameMatch && gradeMatch;
    });
    this.setData({ filteredStudents });
  },

  openStudentFeedback(e) {
    const id = e.currentTarget.dataset.id;
    const student = (this.data.students || []).find((s) => s.id === id);
    if (!student) return;
    wx.navigateTo({ url: `/pages/weekly-feedback/index?studentId=${student.id}` });
  },

  fetchFeedback(studentId) {
    request({ url: `/feedback/list?studentId=${studentId}` })
      .then((data) => {
        const entries = data || [];
        this.setData({ entries, currentPage: 1 }, () => this.applyFilter());
        const user = wx.getStorageSync("user");
        if (user?.role === "parent" && entries.length) {
          wx.setStorageSync(`weekly_seen_${studentId}`, entries[0].weekStarting);
        }
      })
      .catch(() => wx.showToast({ title: "获取反馈失败", icon: "error" }));
  },

  createEntry() {
    if (!this.data.selectedStudentId) {
      wx.showToast({ title: "请先选择学生", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/weekly-feedback/detail?studentId=${this.data.selectedStudentId}` });
  },

  openDetail(e) {
    const weekStarting = e.currentTarget.dataset.week;
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({
      url: `/pages/weekly-feedback/detail?studentId=${this.data.selectedStudentId}&weekStarting=${weekStarting}`,
    });
  },

  today() {
    return formatChinaDate(new Date());
  },

  setFilterMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.filterMode) return;
    this.setData({ filterMode: mode, currentPage: 1 }, () => this.applyFilter());
  },

  onFilterMonthChange(e) {
    this.setData({ filterMonth: e.detail.value, currentPage: 1 }, () => this.applyFilter());
  },

  applyFilter() {
    const { filterMode, entries, filterMonth } = this.data;
    let filtered = [...entries];
    if (filterMode === "month") {
      const month = filterMonth || this.today().slice(0, 7);
      filtered = filtered.filter((e) => (e.weekStarting || "").startsWith(month));
    }
    this.updatePagination(filtered);
  },

  updatePagination(filtered) {
    const totalPages = Math.max(1, Math.ceil(filtered.length / this.data.pageSize));
    const currentPage = Math.min(this.data.currentPage, totalPages);
    const start = (currentPage - 1) * this.data.pageSize;
    const pagedEntries = filtered.slice(start, start + this.data.pageSize);
    this.setData({
      filteredEntries: filtered,
      pagedEntries,
      totalPages,
      currentPage,
    });
  },

  nextPage() {
    if (this.data.currentPage >= this.data.totalPages) return;
    this.setData({ currentPage: this.data.currentPage + 1 }, () => this.applyFilter());
  },

  prevPage() {
    if (this.data.currentPage <= 1) return;
    this.setData({ currentPage: this.data.currentPage - 1 }, () => this.applyFilter());
  },
});
