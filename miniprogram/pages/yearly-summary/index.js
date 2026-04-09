const { request } = require("../../utils/api");
const { formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");

Page({
  data: {
    student: {},
    year: new Date().getFullYear(),
    summary: "",
    isTeacher: false,
    loading: true,
    aiLoading: false,
    lastUpdatedAt: "",
    lastUpdatedBy: "",
    lastUpdatedAtText: "",
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    this.setData({ isTeacher: user?.role === "teacher" });
    this.studentId = query.studentId;
    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "error" });
      wx.navigateBack();
      return;
    }
    this.fetchStudent();
    this.fetchSummary();
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((data) => this.setData({ student: data }))
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchSummary() {
    this.setData({ loading: true });
    request({ url: `/students/${this.studentId}/yearly-summary?year=${this.data.year}` })
      .then((data) => {
        const updatedAtText = data?.updatedAt ? formatChinaDateTime(new Date(data.updatedAt)) : "";
        this.setData({
          summary: data?.summary || "",
          lastUpdatedAt: data?.updatedAt || "",
          lastUpdatedBy: data?.updatedByName || "",
          lastUpdatedAtText: updatedAtText,
        });
      })
      .catch(() => wx.showToast({ title: "获取年度总结失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onSummaryInput(e) {
    this.setData({ summary: e.detail.value });
  },

  save() {
    if (!this.data.isTeacher) return;
    request({
      url: `/students/${this.studentId}/yearly-summary`,
      method: "PUT",
      data: {
        year: this.data.year,
        summary: this.data.summary || "",
        updatedAt: this.data.lastUpdatedAt || "",
      },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.fetchSummary();
      })
      .catch((err) => {
        if (showConflictModal(err, () => this.fetchSummary())) return;
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },

  generateSummary() {
    if (!this.data.isTeacher) return;
    this.setData({ aiLoading: true });
    request({
      url: "/ai/yearly-summary",
      method: "POST",
      data: { studentId: this.studentId, year: this.data.year },
    })
      .then((data) => {
        this.setData({ summary: data?.summary || "" });
        wx.showToast({ title: "已生成", icon: "success" });
      })
      .catch((err) => {
        const msg = err?.error === "AI_NOT_CONFIGURED" ? "AI未配置" : "生成失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ aiLoading: false }));
  },

  openSummaryView() {
    wx.setStorageSync("report_view_payload", {
      title: "年度总结",
      subtitle: `${this.data.student?.name || ""} · ${this.data.year}`,
      content: this.data.summary || "",
    });
    wx.navigateTo({ url: "/pages/report-view/index" });
  },
});
