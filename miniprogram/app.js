const { API_BASE_URL } = require("./utils/env");

App({
  globalData: {
    // Temporary public API URL for WeChat Preview/experience.
    apiBaseUrl: API_BASE_URL,
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
