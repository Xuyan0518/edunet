const { request } = require("../../utils/api");

Page({
  data: {
    role: "parent",
    loading: false,
  },

  onRoleChange(e) {
    this.setData({ role: e.detail.value });
  },

  goAdminLogin() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },

  handleWeChatLogin() {
    if (this.data.loading) return;
    this.setData({ loading: true });

    wx.getUserProfile({
      desc: "用于完善资料",
      success: (profileRes) => {
        const nickname = profileRes?.userInfo?.nickName || "";
        this.loginWithWeChat(nickname);
      },
      fail: () => {
        this.loginWithWeChat("");
      },
    });
  },

  loginWithWeChat(nickname) {
    wx.login({
      success: (res) => {
        if (!res.code) {
          wx.showToast({ title: "微信登录失败", icon: "error" });
          this.setData({ loading: false });
          return;
        }

        const payload = {
          code: res.code,
          role: this.data.role,
        };

        if (nickname) payload.name = nickname;

        request({
          url: "/auth/wechat",
          method: "POST",
          data: payload,
        })
          .then((data) => {
            if (data.token) {
              wx.setStorageSync("token", data.token);
              wx.setStorageSync("user", data.user);
              wx.reLaunch({ url: "/pages/dashboard/index" });
              return;
            }

            if (data.status === "pending_approval") {
              wx.showModal({
                title: "等待审核",
                content: "账号已创建，等待管理员审核后可使用。",
                showCancel: false,
              });
            } else {
              wx.showToast({ title: "登录失败", icon: "error" });
            }
          })
          .catch((err) => {
            const msg = err?.error || "登录失败";
            wx.showToast({ title: msg, icon: "error" });
          })
          .finally(() => {
            this.setData({ loading: false });
          });
      },
      fail: () => {
        wx.showToast({ title: "微信登录失败", icon: "error" });
        this.setData({ loading: false });
      },
    });
  },
});
