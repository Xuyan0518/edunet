const { request } = require("../../utils/api");
const { formatChinaDate } = require("../../utils/chinaDate");
const attendanceLabels = {
  present: "出席",
  late: "迟到",
  absent: "缺席",
};

Page({
  data: {
    students: [],
    studentNames: [],
    selectedStudentId: "",
    selectedStudentName: "",
    entries: [],
    filteredEntries: [],
    pagedEntries: [],
    isTeacher: false,
    filterMode: "all",
    filterMonth: "",
    weekLabel: "",
    weekOptions: [],
    weekRanges: [],
    weekIndex: 0,
    selectedWeekStart: "",
    selectedWeekEnd: "",
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
    this.buildWeekOptions(today);
  },

  onShow() {
    const user = wx.getStorageSync("user");
    this.setData({ isTeacher: user?.role === "teacher" });
    this.fetchStudents();
  },

  fetchStudents() {
    request({ url: "/students" })
      .then((data) => {
        const user = wx.getStorageSync("user");
        const role = user?.role;
        const filtered =
          role === "parent" ? data.filter((s) => s.parentId === user.id) : data;
        const names = (filtered || []).map((s) => s.name);
        this.setData({ students: filtered || [], studentNames: names });

        if (this.presetStudentId) {
          const preset = (filtered || []).find((s) => s.id === this.presetStudentId);
          if (preset) {
            this.setData({
              selectedStudentId: preset.id,
              selectedStudentName: preset.name,
            });
            this.fetchProgress(preset.id);
          }
          return;
        }

        if (this.data.selectedStudentId) {
          const selected = (filtered || []).find((s) => s.id === this.data.selectedStudentId);
          if (selected) {
            this.setData({ selectedStudentName: selected.name });
            this.fetchProgress(selected.id);
          }
          return;
        }

        if ((filtered || []).length === 1) {
          const only = filtered[0];
          this.setData({
            selectedStudentId: only.id,
            selectedStudentName: only.name,
          });
          this.fetchProgress(only.id);
        }
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
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
    this.fetchProgress(student.id);
  },

  fetchProgress(studentId) {
    request({ url: `/students/${studentId}/progress` })
      .then((data) => {
        const entries = (data || []).map((p) => ({
          ...p,
          attendanceLabel: attendanceLabels[p.attendance] || p.attendance,
        }));
        this.setData({ entries, currentPage: 1 }, () => this.applyFilter());
        const user = wx.getStorageSync("user");
        if (user?.role === "parent" && entries.length) {
          wx.setStorageSync(`daily_seen_${studentId}`, entries[0].date);
        }
      })
      .catch(() => wx.showToast({ title: "获取进度失败", icon: "error" }));
  },

  createEntry() {
    if (!this.data.selectedStudentId) {
      wx.showToast({ title: "请先选择学生", icon: "none" });
      return;
    }
    wx.navigateTo({ url: `/pages/daily-progress/detail?studentId=${this.data.selectedStudentId}` });
  },

  openDetail(e) {
    const date = e.currentTarget.dataset.date;
    if (!this.data.selectedStudentId) return;
    wx.navigateTo({
      url: `/pages/daily-progress/detail?studentId=${this.data.selectedStudentId}&date=${date}`,
    });
  },

  today() {
    return formatChinaDate(new Date());
  },

  parseLocalDate(dateStr) {
    const [y, m, d] = dateStr.split("-").map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  },

  formatLocalDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  },

  getWeekRange(dateStr) {
    const date = this.parseLocalDate(dateStr);
    const day = date.getDay();
    const start = new Date(date);
    start.setDate(date.getDate() - day);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: this.formatLocalDate(start), end: this.formatLocalDate(end) };
  },

  buildWeekOptions(baseDate) {
    const range = this.getWeekRange(baseDate);
    const baseStart = this.parseLocalDate(range.start);
    const options = [];
    const ranges = [];
    for (let i = -26; i <= 26; i++) {
      const start = new Date(baseStart);
      start.setDate(baseStart.getDate() + i * 7);
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      const startStr = this.formatLocalDate(start);
      const endStr = this.formatLocalDate(end);
      const label = `${startStr} - ${endStr}`;
      options.push(label);
      ranges.push({ start: startStr, end: endStr, label });
    }
    const currentIndex = options.indexOf(`${range.start} - ${range.end}`);
    this.setData({
      weekOptions: options,
      weekRanges: ranges,
      weekIndex: currentIndex >= 0 ? currentIndex : 0,
      selectedWeekStart: range.start,
      selectedWeekEnd: range.end,
      weekLabel: `${range.start} - ${range.end}`,
    });
  },

  setFilterMode(e) {
    const mode = e.currentTarget.dataset.mode;
    if (mode === this.data.filterMode) return;
    this.setData({ filterMode: mode, currentPage: 1 }, () => this.applyFilter());
  },

  onWeekChange(e) {
    const index = Number(e.detail.value);
    const range = this.data.weekRanges[index];
    if (!range) return;
    this.setData(
      {
        weekIndex: index,
        selectedWeekStart: range.start,
        selectedWeekEnd: range.end,
        weekLabel: range.label,
        currentPage: 1,
      },
      () => this.applyFilter()
    );
  },

  onFilterMonthChange(e) {
    this.setData({ filterMonth: e.detail.value, currentPage: 1 }, () => this.applyFilter());
  },

  applyFilter() {
    const { filterMode, entries, filterMonth, selectedWeekStart, selectedWeekEnd } = this.data;
    let filtered = [...entries];
    if (filterMode === "week") {
      const start = selectedWeekStart || this.getWeekRange(this.today()).start;
      const end = selectedWeekEnd || this.getWeekRange(this.today()).end;
      filtered = filtered.filter((e) => e.date >= start && e.date <= end);
      this.setData({ weekLabel: `${start} - ${end}` });
    } else if (filterMode === "month") {
      const month = filterMonth || this.today().slice(0, 7);
      filtered = filtered.filter((e) => (e.date || "").startsWith(month));
      this.setData({ weekLabel: "" });
    } else {
      this.setData({ weekLabel: "" });
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
