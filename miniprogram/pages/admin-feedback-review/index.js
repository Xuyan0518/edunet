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

  openItem(e) {
    const index = Number(e.currentTarget.dataset.index);
    const item = this.data.pending[index];
    if (!item?.id || !item?.type) return;
    if (item.type === "weekly") {
      const weekStarting = item.weekStarting ? `&weekStarting=${item.weekStarting}` : "";
      wx.navigateTo({ url: `/pages/weekly-feedback/detail?studentId=${item.studentId}${weekStarting}` });
      return;
    }
    if (item.type === "quarterly") {
      const year = item.year ? `&year=${item.year}` : "";
      const quarter = item.quarter ? `&quarter=${item.quarter}` : "";
      wx.navigateTo({ url: `/pages/quarterly-summary/index?studentId=${item.studentId}${year}${quarter}` });
      return;
    }
    if (item.type === "yearly") {
      const year = item.year ? `&year=${item.year}` : "";
      wx.navigateTo({ url: `/pages/yearly-summary/index?studentId=${item.studentId}${year}` });
      return;
    }
    if (item.type === "report") {
      wx.navigateTo({ url: `/pages/report-detail/index?reportId=${item.id}` });
    }
  },

  deleteItem(e) {
    const { id, type } = e.currentTarget.dataset;
    if (!id || !type) return;
    wx.showModal({
      title: "删除报告？",
      content: "删除后会从待审批列表移除，并进入回收站或软删除状态。",
      confirmText: "删除",
      confirmColor: "#dc2626",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/admin/feedback-review/${type}/${id}`,
          method: "DELETE",
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchPending();
          })
          .catch(() => wx.showToast({ title: "删除失败", icon: "error" }));
      },
    });
  },
});
