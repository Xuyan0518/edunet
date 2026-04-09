App({
  globalData: {
    apiBaseUrl: "http://localhost:3003/api",
    user: null,
    token: null,
  },
  onLaunch() {
    const token = wx.getStorageSync("token");
    const user = wx.getStorageSync("user");
    if (token) this.globalData.token = token;
    if (user) this.globalData.user = user;
  },
});
