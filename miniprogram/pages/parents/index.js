const { request } = require("../../utils/api");
const { resolveDisplayName, resolveIdentityHint } = require("../../utils/userIdentity");

Page({
  data: {
    parents: [],
    filtered: [],
    loading: true,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "teacher" || !user?.canManageStudentsAndParents) {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.navigateBack();
      return;
    }
    this.fetchParents();
  },

  fetchParents() {
    this.setData({ loading: true });
    request({ url: "/parents" })
      .then((data) => {
        this.setData({ parents: data || [], filtered: data || [] });
      })
      .catch(() => wx.showToast({ title: "获取家长失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onSearch(e) {
    const query = (e.detail.value || "").trim().toLowerCase();
    const filtered = this.data.parents.filter(
      (p) =>
        resolveDisplayName(p).toLowerCase().includes(query) ||
        resolveIdentityHint(p).toLowerCase().includes(query)
    );
    this.setData({ filtered });
  },

  deleteParent(e) {
    const id = e.currentTarget.dataset.id;
    // Pre-check if parent has students attached
    request({ url: `/parents/${id}/students` })
      .then((students) => {
        if ((students || []).length > 0) {
          wx.showToast({ title: "该家长已绑定学生，请先解绑后再删除。", icon: "none" });
          return;
        }
        wx.showModal({
          title: "确认删除",
          content: "删除家长账号将无法恢复，确定继续？",
          success: (res) => {
            if (!res.confirm) return;
            request({ url: `/parents/${id}`, method: "DELETE" })
              .then(() => {
                wx.showToast({ title: "已删除", icon: "success" });
                this.fetchParents();
              })
              .catch((err) => {
                const msg = err?.details || err?.error || "删除失败";
                wx.showToast({ title: msg, icon: "none" });
              });
          },
        });
      })
      .catch((err) => {
        const msg = err?.details || err?.error || "检查失败";
        wx.showToast({ title: msg, icon: "none" });
      });
  },
});
