const { request } = require("../../utils/api");

Page({
  data: {
    loading: false,
  },

  submit() {
    this.handleWeChatLogin();
  },

  handleWeChatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.getUserProfile({
      desc: "用于管理员身份识别与资料展示",
      success: (profileRes) => {
        const nickname = profileRes?.userInfo?.nickName || "";
        const avatarUrl = profileRes?.userInfo?.avatarUrl || "";
        this.loginWithWeChat({ nickname, avatarUrl });
      },
      fail: (err) => {
        console.warn("getUserProfile failed:", err);
        wx.showToast({
          title: "未获取微信昵称，可登录后在设置里手动修改",
          icon: "none",
        });
        this.loginWithWeChat({ nickname: "", avatarUrl: "" });
      },
    });
  },

  loginWithWeChat({ nickname, avatarUrl }) {
    wx.login({
      success: (res) => {
        if (!res.code) {
          wx.showToast({ title: "微信登录失败", icon: "error" });
          this.setData({ loading: false });
          return;
        }

        const payload = {
          code: res.code,
          role: "admin",
          nickname,
          avatarUrl,
        };

        request({
          url: "/auth/wechat",
          method: "POST",
          data: payload,
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
            const msg = err?.error || "管理员登录失败";
            wx.showToast({ title: msg, icon: "none" });
          })
          .finally(() => this.setData({ loading: false }));
      },
      fail: () => {
        wx.showToast({ title: "微信登录失败", icon: "error" });
        this.setData({ loading: false });
      },
    });
  },
});
