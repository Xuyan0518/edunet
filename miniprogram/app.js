const { API_BASE_URL } = require("./utils/env");

App({
  globalData: {
    // Temporary public API URL for WeChat Preview/experience.
    apiBaseUrl: API_BASE_URL,
    user: null,
    token: null,
    profileRefreshInFlight: false,
  },
  onLaunch() {
    const token = wx.getStorageSync("token");
    const user = wx.getStorageSync("user");
    if (token) this.globalData.token = token;
    if (user) this.globalData.user = user;
    this.refreshProfile();
  },
  onShow() {
    this.refreshProfile();
  },
  refreshProfile() {
    const token = wx.getStorageSync("token");
    if (!token || this.globalData.profileRefreshInFlight) return;
    this.globalData.profileRefreshInFlight = true;
    wx.request({
      url: `${this.globalData.apiBaseUrl}/profile`,
      method: "GET",
      header: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data?.user) {
          wx.setStorageSync("user", res.data.user);
          this.globalData.user = res.data.user;
        }
      },
      complete: () => {
        this.globalData.profileRefreshInFlight = false;
      },
    });
  },
});
