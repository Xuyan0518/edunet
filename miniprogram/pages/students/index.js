const { request } = require("../../utils/api");

Page({
  data: {
    students: [],
    filtered: [],
    loading: true,
    query: "",
    gradeOptions: ["全部年级", "初一", "初二", "初三", "初四"],
    gradeIndex: 0,
    isTeacher: false,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    this.setData({ isTeacher: user?.role === "teacher" });
    this.fetchStudents();
  },

  fetchStudents() {
    this.setData({ loading: true });
    request({ url: "/students" })
      .then((data) => {
        const user = wx.getStorageSync("user");
        const role = user?.role;
        const filtered =
          role === "parent" ? data.filter((s) => s.parentId === user.id) : data;
        this.setData({ students: filtered || [] }, () => this.applyFilters());
      })
      .catch(() => {
        wx.showToast({ title: "获取学生失败", icon: "error" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  onSearch(e) {
    const query = (e.detail.value || "").trim();
    this.setData({ query }, () => this.applyFilters());
  },

  onGradeChange(e) {
    const gradeIndex = Number(e.detail.value);
    this.setData({ gradeIndex }, () => this.applyFilters());
  },

  applyFilters() {
    const query = (this.data.query || "").trim().toLowerCase();
    const grade = this.data.gradeOptions[this.data.gradeIndex] || "全部年级";
    const filtered = this.data.students.filter((s) => {
      const nameMatch = (s.name || "").toLowerCase().includes(query);
      const gradeMatch = grade === "全部年级" ? true : String(s.grade || "") === grade;
      return nameMatch && gradeMatch;
    });
    this.setData({ filtered });
  },

  goDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/student-detail/index?id=${id}` });
  },

  goAdd() {
    wx.navigateTo({ url: "/pages/student-add/index" });
  },
});
