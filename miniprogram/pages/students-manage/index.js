const { request } = require("../../utils/api");

Page({
  data: {
    students: [],
    filtered: [],
    loading: true,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "teacher") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.navigateBack();
      return;
    }
    this.fetchStudents();
  },

  fetchStudents() {
    this.setData({ loading: true });
    request({ url: "/students" })
      .then((data) => {
        const students = (data || []).map((s) => ({
          ...s,
          parentLabel: s.parentId ? "已绑定家长" : "未绑定家长",
        }));
        this.setData({ students, filtered: students });
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onSearch(e) {
    const query = (e.detail.value || "").trim().toLowerCase();
    const filtered = this.data.students.filter((s) => {
      const name = (s.name || "").toLowerCase();
      const grade = String(s.grade || "").toLowerCase();
      return name.includes(query) || grade.includes(query);
    });
    this.setData({ filtered });
  },

  deleteStudent(e) {
    const id = e.currentTarget.dataset.id;
    wx.showModal({
      title: "确认删除",
      content: "删除学生会移除所有关联记录，确定继续？",
      success: (res) => {
        if (!res.confirm) return;
        request({ url: `/students/${id}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchStudents();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "error" }));
      },
    });
  },

  editStudent(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.navigateTo({ url: `/pages/student-add/index?id=${id}` });
  },
});
