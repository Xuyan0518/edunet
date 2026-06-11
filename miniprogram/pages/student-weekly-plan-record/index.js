const { request } = require("../../utils/api");
const { formatChinaDate } = require("../../utils/chinaDate");

const pad2 = (value) => String(value).padStart(2, "0");

Page({
  data: {
    loading: false,
    saving: false,
    students: [],
    studentNames: [],
    selectedStudentId: "",
    selectedStudentName: "",
    weekStarting: "",
    weekEnding: "",
    plan: null,
    recordId: "",
    score: "",
    completed: true,
    comment: "",
  },

  onLoad(query) {
    const today = formatChinaDate(new Date());
    this.presetStudentId = query.studentId || "";
    this.setData({
      weekStarting: query.weekStarting || this.getSunday(today),
    });
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "teacher" && user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchStudents();
  },

  getSunday(ymd) {
    const date = new Date(`${ymd}T00:00:00`);
    if (Number.isNaN(date.getTime())) return ymd;
    date.setDate(date.getDate() - date.getDay());
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  },

  fetchStudents() {
    request({ url: "/students" })
      .then((data) => {
        const students = Array.isArray(data) ? data : [];
        const studentNames = students.map((student) => `${student.name} · ${student.grade}`);
        this.setData({ students, studentNames });
        const preset = this.presetStudentId
          ? students.find((student) => student.id === this.presetStudentId)
          : null;
        const selected = preset || students.find((student) => student.id === this.data.selectedStudentId) || students[0];
        if (selected) {
          this.setData({
            selectedStudentId: selected.id,
            selectedStudentName: selected.name,
          });
          this.fetchRecord();
        }
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  onStudentChange(e) {
    const student = this.data.students[Number(e.detail.value)];
    if (!student) return;
    this.setData({
      selectedStudentId: student.id,
      selectedStudentName: student.name,
      plan: null,
      recordId: "",
      score: "",
      completed: true,
      comment: "",
    });
    this.fetchRecord();
  },

  onWeekChange(e) {
    const value = e?.detail?.value;
    if (!value) return;
    this.setData({ weekStarting: this.getSunday(value) }, () => this.fetchRecord());
  },

  fetchRecord() {
    if (!this.data.selectedStudentId) return;
    this.setData({ loading: true });
    request({
      url: `/students/${this.data.selectedStudentId}/weekly-plan-record?weekStarting=${encodeURIComponent(this.data.weekStarting)}`,
    })
      .then((data) => {
        const record = data?.record || null;
        this.setData({
          weekStarting: data?.cycle?.startDate || this.data.weekStarting,
          weekEnding: data?.cycle?.endDate || "",
          plan: data?.plan || null,
          recordId: record?.id || "",
          score: record?.score == null ? "" : String(record.score),
          completed: record ? !!record.completed : true,
          comment: record?.comment || "",
          loading: false,
        });
      })
      .catch((err) => {
        this.setData({ loading: false });
        wx.showToast({ title: err?.error || "加载失败", icon: "none" });
      });
  },

  onScoreInput(e) {
    this.setData({ score: e.detail.value || "" });
  },

  onCompletedChange(e) {
    this.setData({ completed: !!e.detail.value });
  },

  onCommentInput(e) {
    this.setData({ comment: e.detail.value || "" });
  },

  save() {
    if (!this.data.plan?.id) {
      wx.showToast({ title: "当前年级还没有周计划", icon: "none" });
      return;
    }
    const rawScore = String(this.data.score || "").trim();
    const score = rawScore === "" ? null : Number(rawScore);
    if (score != null && (!Number.isFinite(score) || score < 0 || score > 100)) {
      wx.showToast({ title: "分数需为 0-100", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    request({
      url: "/student-weekly-plan-records",
      method: "POST",
      data: {
        studentId: this.data.selectedStudentId,
        gradeWeeklyPlanId: this.data.plan.id,
        score,
        completed: this.data.completed,
        comment: this.data.comment || "",
      },
    })
      .then((data) => {
        const record = data?.record || {};
        this.setData({
          recordId: record.id || this.data.recordId,
          completed: !!record.completed,
          score: record.score == null ? "" : String(record.score),
          comment: record.comment || "",
        });
        wx.showToast({ title: "已保存", icon: "success" });
      })
      .catch((err) => wx.showToast({ title: err?.error || "保存失败", icon: "none" }))
      .finally(() => this.setData({ saving: false }));
  },
});
