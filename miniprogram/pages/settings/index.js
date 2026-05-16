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
    pendingTemplateIds: [],
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
    const pendingFromState = Array.isArray(this.data.pendingTemplateIds) ? this.data.pendingTemplateIds : [];
    const queue = pendingFromState.length
      ? pendingFromState.filter((id) => uniqueTemplateIds.includes(id))
      : uniqueTemplateIds;
    const batch = chunkArray(queue, 3)[0] || [];
    const remaining = queue.slice(batch.length);
    if (!batch.length) {
      wx.showToast({ title: "暂无可订阅模板", icon: "none" });
      return;
    }

    this.setData({ subscribing: true });
    try {
      const result = (await requestSubscribeBatch(batch)) || {};

      const accepted = [];
      const rejected = [];
      const pending = [];
      for (const id of batch) {
        const meta = templateById.get(id);
        const status = result[id];
        if (!meta) continue;
        if (status === "accept") accepted.push(meta.label);
        else if (status === "reject") rejected.push(meta.label);
        else pending.push(meta.label);
      }

      this.setData({ pendingTemplateIds: remaining });

      const lines = [];
      if (accepted.length) lines.push(`已授权：${accepted.join("、")}`);
      if (rejected.length) lines.push(`已拒绝：${rejected.join("、")}`);
      if (pending.length) lines.push(`未完成：${pending.join("、")}`);
      if (remaining.length) {
        const remainingLabels = remaining
          .map((id) => templateById.get(id)?.label)
          .filter(Boolean);
        if (remainingLabels.length) {
          lines.push(`仍需授权：${remainingLabels.join("、")}（请再点一次“订阅通知”）`);
        }
      }
      const content = lines.join("\n") || "未完成订阅授权";
      wx.showModal({
        title: "订阅结果",
        content,
        showCancel: false,
      });
    } catch (err) {
      const code = err && typeof err.errCode !== "undefined" ? String(err.errCode) : "";
      const msg = String((err && err.errMsg) || "").trim();
      wx.showToast({ title: code ? `订阅失败(${code})` : "订阅失败", icon: "none" });
      if (msg) {
        wx.showModal({
          title: "失败详情",
          content: msg,
          showCancel: false,
        });
      }
    } finally {
      this.setData({ subscribing: false });
    }
  },

  logout() {
    wx.clearStorageSync();
    wx.reLaunch({ url: "/pages/login/index" });
  },
});
