const { request } = require("../../utils/api");

Page({
  data: {
    loading: true,
    metrics: {},
    currentCycleText: "",
    pendingAccessCount: 0,
    pendingFeedbackCount: 0,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchSummary();
  },

  fetchSummary() {
    this.setData({ loading: true });
    request({ url: "/admin/student-management" })
      .then((data) => {
        const metrics = data?.metrics || {};
        this.setData({
          metrics,
          currentCycleText: data?.currentCycle ? `${data.currentCycle.startDate} 至 ${data.currentCycle.endDate}` : "",
          pendingAccessCount: (metrics.pendingParents || 0) + (metrics.pendingTeachers || 0),
          pendingFeedbackCount: 0,
        });
      })
      .catch(() => wx.showToast({ title: "获取管理数据失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  goStudents() {
    wx.navigateTo({ url: "/pages/admin-students/index" });
  },

  goUsers() {
    wx.navigateTo({ url: "/pages/admin-users/index" });
  },

  goFeedbackReview() {
    wx.navigateTo({ url: "/pages/admin-feedback-review/index" });
  },
});
