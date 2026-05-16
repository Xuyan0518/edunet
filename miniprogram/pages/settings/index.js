const { request } = require("../../utils/api");
const { subscribeTemplates } = require("../../utils/config");

const TEMPLATE_LABELS = {
  weekly: "周报",
  exam: "考试/成绩",
  semester: "学期报告",
  yearly: "年度报告",
};

function chunkArray(list, size) {
  const chunks = [];
  for (let i = 0; i < list.length; i += size) {
    chunks.push(list.slice(i, i + size));
  }
  return chunks;
}

function requestSubscribeBatch(tmplIds) {
  return new Promise((resolve, reject) => {
    wx.requestSubscribeMessage({
      tmplIds,
      success: resolve,
      fail: reject,
    });
  });
}

Page({
  data: {
    user: {},
    isParent: false,
    editingName: false,
    draftName: "",
    savingName: false,
    subscribing: false,
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

  async subscribe() {
    if (this.data.subscribing) return;
    const templateEntries = Object.keys(TEMPLATE_LABELS)
      .map((key) => ({
        key,
        label: TEMPLATE_LABELS[key],
        id: String(subscribeTemplates[key] || "").trim(),
      }))
      .filter((item) => !!item.id);

    if (!templateEntries.length) {
      wx.showModal({
        title: "未配置模板",
        content: "请先在 miniprogram/utils/config.js 填入订阅模板ID。",
        showCancel: false,
      });
      return;
    }

    const templateById = new Map(templateEntries.map((item) => [item.id, item]));
    const uniqueTemplateIds = Array.from(new Set(templateEntries.map((item) => item.id)));
    const batches = chunkArray(uniqueTemplateIds, 3); // 小程序单次最多 3 个
    const mergedResult = {};

    this.setData({ subscribing: true });
    try {
      for (const batch of batches) {
        const res = await requestSubscribeBatch(batch);
        Object.assign(mergedResult, res || {});
      }

      const accepted = [];
      const rejected = [];
      const pending = [];
      for (const id of uniqueTemplateIds) {
        const meta = templateById.get(id);
        const status = mergedResult[id];
        if (!meta) continue;
        if (status === "accept") accepted.push(meta.label);
        else if (status === "reject") rejected.push(meta.label);
        else pending.push(meta.label);
      }

      const lines = [];
      if (accepted.length) lines.push(`已授权：${accepted.join("、")}`);
      if (rejected.length) lines.push(`已拒绝：${rejected.join("、")}`);
      if (pending.length) lines.push(`未完成：${pending.join("、")}`);
      const content = lines.join("\n") || "未完成订阅授权";
      wx.showModal({
        title: "订阅结果",
        content,
        showCancel: false,
      });
    } catch (err) {
      const code = err && typeof err.errCode !== "undefined" ? String(err.errCode) : "";
      wx.showToast({ title: code ? `订阅失败(${code})` : "订阅失败", icon: "none" });
    } finally {
      this.setData({ subscribing: false });
    }
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: "/pages/login/index" });
  },
});
