Page({
  data: {
    user: {},
  },

  onShow() {
    const user = wx.getStorageSync("user") || {};
    this.setData({ user });
  },
});
