const { subscribeTemplates } = require("../../utils/config");

Page({
  data: {
    user: {},
    isParent: false,
  },

  onShow() {
    const user = wx.getStorageSync("user") || {};
    this.setData({ user, isParent: user?.role === "parent" });
  },

  subscribe() {
    const ids = [
      subscribeTemplates.weekly,
      subscribeTemplates.exam,
      subscribeTemplates.semester,
      subscribeTemplates.yearly,
    ].filter(Boolean);
    if (!ids.length) {
      wx.showModal({
        title: "未配置模板",
        content: "请先在 miniprogram/utils/config.js 填入模板ID。",
        showCancel: false,
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success: () => wx.showToast({ title: "订阅成功", icon: "success" }),
      fail: () => wx.showToast({ title: "订阅失败", icon: "error" }),
    });
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: "/pages/login/index" });
  },
});
