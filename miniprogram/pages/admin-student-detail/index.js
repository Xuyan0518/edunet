const { request } = require("../../utils/api");

const shortDate = (value) => (value ? String(value).slice(0, 10) : "暂无");

const decorateStudent = (student) => {
  const stats = student.stats || {};
  const parents = Array.isArray(student.parents) ? student.parents : (student.parent ? [student.parent] : []);
  return {
    ...student,
    parentIds: Array.isArray(student.parentIds) ? student.parentIds : (student.parentId ? [student.parentId] : []),
    parents,
    parentName: parents.length
      ? parents.map((parent) => parent.displayName || parent.name || "未命名家长").join("、")
      : "未绑定家长",
    latestDailyText: shortDate(stats.latestDailyDate),
    latestWeeklyText: shortDate(stats.latestWeeklyStart),
    latestReportText: stats.latestReportTitle || "暂无报告",
    dailyCount: stats.dailyCount || 0,
    weeklyCount: stats.weeklyCount || 0,
    termCount: stats.quarterlyCount || 0,
    yearlyCount: stats.yearlyCount || 0,
    reportCount: stats.reportCount || 0,
  };
};

Page({
  data: {
    loading: true,
    studentId: "",
    selectedStudent: null,
    parentNames: ["不绑定家长"],
    parentOptions: [],
    editStudentName: "",
    editStudentGrade: "",
    editParentIds: [],
  },

  onLoad(query) {
    this.setData({ studentId: query?.studentId || query?.id || "" });
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    if (!this.data.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "none" });
      wx.navigateBack({ delta: 1 });
      return;
    }
    this.fetchDetail();
  },

  fetchDetail() {
    this.setData({ loading: true });
    return request({ url: "/admin/student-management" })
      .then((data) => {
        const students = (data?.students || []).map(decorateStudent);
        const selectedStudent = students.find((student) => student.id === this.data.studentId) || null;
        const parents = (data?.access?.parents || []).map((parent) => ({
          ...parent,
          isSelected: selectedStudent?.parentIds?.includes(parent.id),
        }));
        if (!selectedStudent) {
          wx.showToast({ title: "未找到学生", icon: "none" });
          wx.navigateBack({ delta: 1 });
          return;
        }
        this.setData({ selectedStudent, parentOptions: parents });
        this.syncEditForm(selectedStudent);
      })
      .catch(() => wx.showToast({ title: "获取学生数据失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  syncEditForm(student) {
    const editParentIds = Array.isArray(student?.parentIds) ? student.parentIds : (student?.parentId ? [student.parentId] : []);
    const parentOptions = this.data.parentOptions.map((parent) => ({
      ...parent,
      isSelected: editParentIds.includes(parent.id),
    }));
    this.setData({
      editStudentName: student?.name || "",
      editStudentGrade: student?.grade || "",
      editParentIds,
      parentOptions,
    });
  },

  onEditName(e) {
    this.setData({ editStudentName: e.detail.value || "" });
  },

  onEditGrade(e) {
    this.setData({ editStudentGrade: e.detail.value || "" });
  },

  onParentChange(e) {
    const editParentIds = e.detail.value || [];
    const parentOptions = this.data.parentOptions.map((parent) => ({
      ...parent,
      isSelected: editParentIds.includes(parent.id),
    }));
    this.setData({ editParentIds, parentOptions });
  },

  saveStudentProfile() {
    const student = this.data.selectedStudent;
    if (!student) return;
    const name = (this.data.editStudentName || "").trim();
    const grade = (this.data.editStudentGrade || "").trim();
    if (!name || !grade) {
      wx.showToast({ title: "姓名和年级必填", icon: "none" });
      return;
    }
    wx.showLoading({ title: "保存中" });
    request({
      url: `/students/${student.id}`,
      method: "PUT",
      data: {
        name,
        grade,
        parentIds: this.data.editParentIds || [],
        parentId: (this.data.editParentIds || [])[0] || null,
      },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.fetchDetail();
      })
      .catch(() => wx.showToast({ title: "保存失败", icon: "error" }))
      .finally(() => wx.hideLoading());
  },

  goStudentDetail() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/student-detail/index?id=${this.data.studentId}` });
  },

  goDailyProgress() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/daily-progress/detail?studentId=${this.data.studentId}` });
  },

  goWeeklyFeedback() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/weekly-feedback/detail?studentId=${this.data.studentId}` });
  },

  goReports() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/reports/index?studentId=${this.data.studentId}` });
  },

  goQuarterly() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/quarterly-summary/index?studentId=${this.data.studentId}` });
  },

  goYearly() {
    if (!this.data.studentId) return;
    wx.navigateTo({ url: `/pages/yearly-summary/index?studentId=${this.data.studentId}` });
  },

  exportSelectedStudentWorkbook() {
    const student = this.data.selectedStudent;
    if (!student?.id) return;
    const baseUrl = getApp().globalData.apiBaseUrl;
    const token = wx.getStorageSync("token");
    const safeName = String(student.name || "student").replace(/[\\/:*?"<>|\s]+/g, "_");
    const fileName = `${safeName}_weekly_reports.xls`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    const openExcelFile = (downloadedFilePath) => {
      wx.openDocument({
        filePath: downloadedFilePath,
        fileType: "xls",
        showMenu: true,
        success: () => wx.showToast({ title: "已打开表格", icon: "success" }),
        fail: () => wx.showModal({
          title: "打开失败",
          content: "当前环境无法预览表格。请在真机微信或电脑端微信中重试。",
          showCancel: false,
        }),
      });
    };
    wx.showLoading({ title: "导出中" });
    wx.downloadFile({
      url: `${baseUrl}/admin/students/${student.id}/wellbeing-export`,
      filePath,
      header: token ? { Authorization: `Bearer ${token}` } : {},
      success: (res) => {
        if (res.statusCode !== 200) {
          wx.showToast({ title: "导出失败", icon: "error" });
          return;
        }
        openExcelFile(res.filePath || res.tempFilePath || filePath);
      },
      fail: () => wx.showToast({ title: "下载失败", icon: "error" }),
      complete: () => wx.hideLoading(),
    });
  },
});
