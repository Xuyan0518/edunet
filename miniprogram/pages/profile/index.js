const { request } = require("../../utils/api");

Page({
  data: {
    user: {},
  },

  onShow() {
    const user = wx.getStorageSync("user") || {};
    this.setData({ user });
    this.refreshProfile();
  },

  refreshProfile() {
    request({ url: "/profile" })
      .then((res) => {
        if (!res?.user) return;
        wx.setStorageSync("user", res.user);
        this.setData({ user: res.user });
      })
      .catch(() => {});
  },
});
