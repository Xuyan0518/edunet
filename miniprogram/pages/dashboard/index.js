Page({
  data: {
    userName: "",
    isTeacher: false,
    manageOpen: false,
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role === "admin") {
      wx.reLaunch({ url: "/pages/admin-dashboard/index" });
      return;
    }
    this.setData({ userName: user?.name || "", isTeacher: user?.role === "teacher" });
  },

  goStudents() {
    wx.navigateTo({ url: "/pages/students/index" });
  },

  goDaily() {
    wx.navigateTo({ url: "/pages/daily-progress/index" });
  },

  goWeekly() {
    wx.navigateTo({ url: "/pages/weekly-feedback/index" });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  goParents() {
    wx.navigateTo({ url: "/pages/parents/index" });
  },

  goStudentsManage() {
    wx.navigateTo({ url: "/pages/students-manage/index" });
  },

  toggleManage() {
    if (!this.data.isTeacher) return;
    this.setData({ manageOpen: !this.data.manageOpen });
  },
});
