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
          role: this.data.role,
          nickname,
          avatarUrl,
        };

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
            if (err?.status === "pending_approval") {
              wx.showModal({
                title: "等待审核",
                content: "账号已创建，等待管理员审核后可使用。",
                showCancel: false,
              });
              return;
            }
            const msg = err?.error || "登录失败";
            wx.showToast({ title: msg, icon: "none" });
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
