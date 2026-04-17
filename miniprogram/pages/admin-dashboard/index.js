const { request } = require("../../utils/api");
const { resolveDisplayName, resolveIdentityHint } = require("../../utils/userIdentity");

Page({
  data: {
    pendingParents: [],
    pendingTeachers: [],
    teachers: [],
    filteredTeachers: [],
    loading: true,
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
    return Promise.all([this.fetchPending(), this.fetchTeachers()])
      .catch(() => {})
      .finally(() => this.setData({ loading: false }));
  },

  fetchPending() {
    return request({ url: "/admin/pending" })
      .then((data) => {
        this.setData({
          pendingParents: data?.parents || [],
          pendingTeachers: data?.teachers || [],
        });
      })
      .catch(() => wx.showToast({ title: "获取待审批失败", icon: "error" }));
  },

  fetchTeachers() {
    return request({ url: "/teachers" })
      .then((data) => {
        const teachers = data || [];
        this.setData({ teachers, filteredTeachers: teachers });
      })
      .catch(() => wx.showToast({ title: "获取教师失败", icon: "error" }));
  },

  onSearchTeacher(e) {
    const query = (e.detail.value || "").trim().toLowerCase();
    const filtered = this.data.teachers.filter((t) => {
      const name = resolveDisplayName(t).toLowerCase();
      const identity = resolveIdentityHint(t).toLowerCase();
      return name.includes(query) || identity.includes(query);
    });
    this.setData({ filteredTeachers: filtered });
  },

  handleApprove(e) {
    const { id, role } = e.currentTarget.dataset;
    request({ url: "/admin/approve", method: "POST", data: { id, role } })
      .then(() => {
        wx.showToast({ title: "已批准", icon: "success" });
        return this.fetchPending();
      })
      .catch(() => wx.showToast({ title: "操作失败", icon: "error" }));
  },

  handleReject(e) {
    const { id, role } = e.currentTarget.dataset;
    request({ url: "/admin/reject", method: "POST", data: { id, role } })
      .then(() => {
        wx.showToast({ title: "已拒绝", icon: "success" });
        return this.fetchPending();
      })
      .catch(() => wx.showToast({ title: "操作失败", icon: "error" }));
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
            this.fetchTeachers();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "error" }));
      },
    });
  },
});
