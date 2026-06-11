const { request } = require("../../utils/api");
const { formatChinaDate } = require("../../utils/chinaDate");

const pad2 = (value) => String(value).padStart(2, "0");

Page({
  data: {
    loading: true,
    savingGrade: "",
    weekStarting: "",
    weekEnding: "",
    grades: [],
    planRows: [],
  },

  onLoad() {
    const today = formatChinaDate(new Date());
    this.setData({ weekStarting: this.getSunday(today) });
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "teacher" && user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchAll();
  },

  getSunday(ymd) {
    const date = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    date.setDate(date.getDate() - date.getDay());
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  },

  fetchAll() {
    this.setData({ loading: true });
    Promise.all([
      request({ url: "/students" }),
      request({ url: `/grade-weekly-plans?weekStarting=${encodeURIComponent(this.data.weekStarting)}` }),
    ])
      .then(([studentsData, plansData]) => {
        const grades = Array.from(new Set((studentsData || []).map((s) => s.grade).filter(Boolean))).sort();
        const plansByGrade = {};
        (plansData?.plans || []).forEach((plan) => {
          plansByGrade[plan.grade] = {
            id: plan.id,
            topic: plan.topic || "",
            notes: plan.notes || "",
            updatedByName: plan.updatedByName || "",
            updatedAt: plan.updatedAt || "",
          };
        });
        const planRows = grades.map((grade) => ({
          grade,
          ...(plansByGrade[grade] || { topic: "", notes: "" }),
        }));
        this.setData({
          grades,
          planRows,
          weekStarting: plansData?.cycle?.startDate || this.data.weekStarting,
          weekEnding: plansData?.cycle?.endDate || "",
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
    this.setData({ weekStarting: this.getSunday(value) }, () => this.fetchAll());
  },

  onPlanInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const value = e.detail.value || "";
    if (!Number.isFinite(index)) return;
    this.setData({
      [`planRows[${index}].${field}`]: value,
    });
  },

  savePlan(e) {
    const index = Number(e.currentTarget.dataset.index);
    const plan = this.data.planRows[index] || {};
    const grade = plan.grade;
    const topic = String(plan.topic || "").trim();
    if (!topic) {
      wx.showToast({ title: "请填写计划课题", icon: "none" });
      return;
    }
    this.setData({ savingGrade: grade });
    request({
      url: "/grade-weekly-plans",
      method: "POST",
      data: {
        grade,
        weekStarting: this.data.weekStarting,
        weekEnding: this.data.weekEnding,
        topic,
        notes: plan.notes || "",
      },
    })
      .then((data) => {
        const saved = data?.plan;
        if (saved) {
          this.setData({
            [`planRows[${index}]`]: {
              grade,
              id: saved.id,
              topic: saved.topic || "",
              notes: saved.notes || "",
              updatedByName: saved.updatedByName || "",
              updatedAt: saved.updatedAt || "",
            },
            weekStarting: data?.cycle?.startDate || this.data.weekStarting,
            weekEnding: data?.cycle?.endDate || this.data.weekEnding,
          });
        }
        wx.showToast({ title: "已保存", icon: "success" });
      })
      .catch((err) => {
        wx.showToast({ title: err?.error || "保存失败", icon: "none" });
      })
      .finally(() => this.setData({ savingGrade: "" }));
  },
});
