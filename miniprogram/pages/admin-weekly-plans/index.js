const { request } = require("../../utils/api");
const { API_BASE_URL } = require("../../utils/env");
const { formatChinaDate } = require("../../utils/chinaDate");

const pad2 = (value) => String(value).padStart(2, "0");

Page({
  data: {
    loading: false,
    tab: "weekly",
    weekStarting: "",
    weekEnding: "",
    termStartDate: "",
    termEndDate: "",
    exportMonth: "",
    weeklyGroups: [],
    weeklyMetrics: {},
    termGroups: [],
    termMetrics: {},
  },

  onLoad() {
    const today = formatChinaDate(new Date());
    this.setData({
      weekStarting: this.getSunday(today),
      termStartDate: `${today.slice(0, 4)}-01-01`,
      termEndDate: today,
      exportMonth: today.slice(0, 7),
    });
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchCurrent();
  },

  getSunday(ymd) {
    const date = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    date.setDate(date.getDate() - date.getDay());
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  },

  setTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.tab) return;
    this.setData({ tab }, () => this.fetchCurrent());
  },

  fetchCurrent() {
    if (this.data.tab === "weekly") return this.fetchWeekly();
    return this.fetchTerm();
  },

  fetchWeekly() {
    this.setData({ loading: true });
    request({ url: `/admin/weekly-plan-summary?weekStarting=${encodeURIComponent(this.data.weekStarting)}` })
      .then((data) => {
        const groups = (data?.groups || []).map((group) => ({
          ...group,
          plan: group.plan || { topic: "未制定计划" },
          rows: group.rows || [],
        }));
        this.setData({
          weekStarting: data?.cycle?.startDate || this.data.weekStarting,
          weekEnding: data?.cycle?.endDate || "",
          weeklyGroups: groups,
          weeklyMetrics: data?.metrics || {},
          loading: false,
        });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "加载失败", icon: "error" });
      });
  },

  fetchTerm() {
    this.setData({ loading: true });
    request({
      url: `/admin/term-plan-summary?startDate=${encodeURIComponent(this.data.termStartDate)}&endDate=${encodeURIComponent(this.data.termEndDate)}`,
    })
      .then((data) => {
        const groups = (data?.groups || []).map((group) => ({
          ...group,
          rows: (group.rows || []).map((row) => ({
            ...row,
            incompleteTopicsText: (row.incompleteTopics || []).join("；"),
          })),
        }));
        this.setData({
          termGroups: groups,
          termMetrics: data?.metrics || {},
          loading: false,
        });
      })
      .catch(() => {
        this.setData({ loading: false });
        wx.showToast({ title: "加载失败", icon: "error" });
      });
  },

  onWeekChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ weekStarting: this.getSunday(value) }, () => this.fetchWeekly());
  },

  onTermStartChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ termStartDate: value }, () => this.fetchTerm());
  },

  onTermEndChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ termEndDate: value }, () => this.fetchTerm());
  },

  onExportStartChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ termStartDate: value });
  },

  onExportEndChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ termEndDate: value });
  },

  onExportMonthChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    const end = this.getMonthEnd(value);
    this.setData({
      exportMonth: value,
      termStartDate: `${value}-01`,
      termEndDate: end,
    }, () => this.fetchCurrent());
  },

  setRecentMonths(e) {
    const months = Number(e.currentTarget.dataset.months || 1);
    const base = this.data.exportMonth || formatChinaDate(new Date()).slice(0, 7);
    const endDate = this.getMonthEnd(base);
    const [year, month] = base.split("-").map(Number);
    const start = new Date(year, month - months, 1);
    const startMonth = `${start.getFullYear()}-${pad2(start.getMonth() + 1)}`;
    this.setData({
      termStartDate: `${startMonth}-01`,
      termEndDate: endDate,
    }, () => this.fetchCurrent());
  },

  getMonthEnd(yyyyMm) {
    const [year, month] = String(yyyyMm || "").split("-").map(Number);
    if (!year || !month) return this.data.termEndDate;
    const end = new Date(year, month, 0);
    return `${end.getFullYear()}-${pad2(end.getMonth() + 1)}-${pad2(end.getDate())}`;
  },

  exportCurrent() {
    const token = wx.getStorageSync("token");
    const app = getApp();
    const baseUrl = app?.globalData?.apiBaseUrl || API_BASE_URL;
    const url = this.data.tab === "weekly"
      ? `${baseUrl}/admin/weekly-plan-summary/export?weekStarting=${encodeURIComponent(this.data.weekStarting)}`
      : `${baseUrl}/admin/term-plan-summary/export?startDate=${encodeURIComponent(this.data.termStartDate)}&endDate=${encodeURIComponent(this.data.termEndDate)}`;
    wx.showLoading({ title: "导出中" });
    wx.downloadFile({
      url,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: "导出失败", icon: "error" });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          fileType: "xls",
          showMenu: true,
          fail: () => wx.showToast({ title: "打开文件失败", icon: "none" }),
        });
      },
      fail: () => wx.showToast({ title: "导出失败", icon: "error" }),
      complete: () => wx.hideLoading(),
    });
  },

  exportLearningTasks() {
    const token = wx.getStorageSync("token");
    const app = getApp();
    const baseUrl = app?.globalData?.apiBaseUrl || API_BASE_URL;
    const url = `${baseUrl}/admin/learning-task-completion/export?startDate=${encodeURIComponent(this.data.termStartDate)}&endDate=${encodeURIComponent(this.data.termEndDate)}`;
    wx.showLoading({ title: "导出中" });
    wx.downloadFile({
      url,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: "导出失败", icon: "error" });
          return;
        }
        wx.openDocument({
          filePath: res.tempFilePath,
          fileType: "xlsx",
          showMenu: true,
          fail: () => wx.showToast({ title: "打开文件失败", icon: "none" }),
        });
      },
      fail: () => wx.showToast({ title: "导出失败", icon: "error" }),
      complete: () => wx.hideLoading(),
    });
  },
});
