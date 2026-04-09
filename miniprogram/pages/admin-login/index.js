const { request } = require("../../utils/api");

Page({
  data: {
    email: "",
    password: "",
    loading: false,
  },

  onEmailInput(e) {
    this.setData({ email: e.detail.value });
  },

  onPasswordInput(e) {
    this.setData({ password: e.detail.value });
  },

  submit() {
    if (this.data.loading) return;
    const email = (this.data.email || "").trim();
    const password = this.data.password || "";
    if (!email || !password) {
      wx.showToast({ title: "请输入邮箱和密码", icon: "error" });
      return;
    }

    this.setData({ loading: true });
    request({
      url: "/admin/login",
      method: "POST",
      data: { email, password },
    })
      .then((data) => {
        if (!data?.token) {
          wx.showToast({ title: "登录失败", icon: "error" });
          return;
        }
        wx.setStorageSync("token", data.token);
        wx.setStorageSync("user", data.user);
        wx.reLaunch({ url: "/pages/admin-dashboard/index" });
      })
      .catch((err) => {
        const msg = err?.error || "登录失败";
        wx.showToast({ title: msg, icon: "error" });
      })
      .finally(() => this.setData({ loading: false }));
  },
});
