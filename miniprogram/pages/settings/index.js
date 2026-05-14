const { request } = require("../../utils/api");
const { subscribeTemplates } = require("../../utils/config");

Page({
  data: {
    user: {},
    isParent: false,
    editingName: false,
    draftName: "",
    savingName: false,
  },

  onShow() {
    const user = wx.getStorageSync("user") || {};
    this.setData({ user, isParent: user?.role === "parent" });
  },

  startEditName() {
    const user = this.data.user || {};
    this.setData({
      editingName: true,
      draftName: user.displayName || user.name || "",
    });
  },

  onNameInput(e) {
    this.setData({ draftName: e.detail.value || "" });
  },

  cancelEditName() {
    this.setData({ editingName: false, draftName: "" });
  },

  saveDisplayName() {
    if (this.data.savingName) return;
    const displayName = (this.data.draftName || "").trim();
    if (!displayName) {
      wx.showToast({ title: "昵称不能为空", icon: "none" });
      return;
    }

    this.setData({ savingName: true });
    request({
      url: "/profile",
      method: "PUT",
      data: { displayName },
    })
      .then((res) => {
        const nextUser = res?.user || {};
        wx.setStorageSync("user", nextUser);
        this.setData({
          user: nextUser,
          editingName: false,
          draftName: "",
        });
        wx.showToast({ title: "昵称已更新", icon: "success" });
      })
      .catch((err) => {
        const msg = err?.error || "更新失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ savingName: false }));
  },

  subscribe() {
    const weeklyTemplateId = (subscribeTemplates.weekly || "").trim();
    if (!weeklyTemplateId) {
      wx.showModal({
        title: "未配置模板",
        content: "请先在 miniprogram/utils/config.js 填入 weekly 模板ID。",
        showCancel: false,
      });
      return;
    }
    wx.requestSubscribeMessage({
      tmplIds: [weeklyTemplateId],
      success: (res = {}) => {
        const status = res[weeklyTemplateId];
        if (status === "accept") {
          wx.showToast({ title: "周报订阅成功", icon: "success" });
          return;
        }
        if (status === "reject") {
          wx.showToast({ title: "你拒绝了订阅", icon: "none" });
          return;
        }
        if (status === "ban" || status === "filter") {
          wx.showToast({ title: `订阅状态：${status}`, icon: "none" });
          return;
        }
        wx.showToast({ title: "未完成订阅", icon: "none" });
      },
      fail: (err) => {
        const code = err && typeof err.errCode !== "undefined" ? String(err.errCode) : "";
        wx.showToast({ title: code ? `订阅失败(${code})` : "订阅失败", icon: "none" });
      },
    });
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: "/pages/login/index" });
  },
});
