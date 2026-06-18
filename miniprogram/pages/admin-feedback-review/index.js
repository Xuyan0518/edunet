const { request } = require("../../utils/api");

Page({
  data: {
    loading: true,
    publishingId: "",
    pending: [],
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchPending();
  },

  fetchPending() {
    this.setData({ loading: true });
    return request({ url: "/admin/feedback-review" })
      .then((data) => this.setData({ pending: data?.pending || [] }))
      .catch(() => wx.showToast({ title: "获取待审批失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  publishItem(e) {
    const { id, type } = e.currentTarget.dataset;
    if (!id || !type) return;
    wx.showModal({
      title: "发布给家长？",
      content: "发布后家长端即可查看该反馈。",
      success: (res) => {
        if (!res.confirm) return;
        this.setData({ publishingId: id });
        request({
          url: `/admin/feedback-review/${type}/${id}/publish`,
          method: "POST",
        })
          .then(() => {
            wx.showToast({ title: "已发布", icon: "success" });
            this.fetchPending();
          })
          .catch(() => wx.showToast({ title: "发布失败", icon: "error" }))
          .finally(() => this.setData({ publishingId: "" }));
      },
    });
  },
});
