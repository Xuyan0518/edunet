const { request } = require("../../utils/api");
const { trimText, validateTextLength } = require("../../utils/validation");

const DEFAULT_AVATAR_URL =
  "https://mmbiz.qpic.cn/mmbiz/icTdbqWNOwNRna42FI242Lcia07jQodd2FJGIYQfG0LAJGFxM4FbnQP6yfMxBgJ0F3YRqJCJ1aPAK2dQagdusBZg/0";

Page({
  data: {
    role: "parent",
    avatarUrl: "",
    defaultAvatarUrl: DEFAULT_AVATAR_URL,
    needsProfile: false,
    loading: false,
    reviewerUsername: "account",
    reviewerPassword: "",
    reviewerLoading: false,
  },

  onRoleChange(e) {
    this.setData({ role: e.detail.value, needsProfile: false });
  },

  onChooseAvatar(e) {
    const avatarUrl = e?.detail?.avatarUrl || "";
    if (avatarUrl) {
      this.setData({ avatarUrl });
    }
  },

  goAdminLogin() {
    wx.navigateTo({ url: "/pages/admin-login/index" });
  },

  onReviewerInput(e) {
    const field = e?.currentTarget?.dataset?.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value || "" });
  },

  // Returning users: no profile form — just wx.login and try to sign in.
  handleQuickLogin() {
    if (this.data.loading) return;
    this.submitLogin({ nickname: "", avatarUrl: "" });
  },

  // First-time users: only reached after quick login returned nickname_required.
  handleProfileSubmit(e) {
    if (this.data.loading) return;
    const nickname = ((e && e.detail && e.detail.value && e.detail.value.nickname) || "").trim();
    if (!nickname) {
      wx.showToast({ title: "请先填写昵称", icon: "none" });
      return;
    }
    this.submitLogin({ nickname, avatarUrl: this.data.avatarUrl || "" });
  },

  submitLogin({ nickname, avatarUrl }) {
    this.setData({ loading: true });

    wx.login({
      success: (res) => {
        if (!res.code) {
          wx.showToast({ title: "微信登录失败", icon: "error" });
          this.setData({ loading: false });
          return;
        }

        const payload = { code: res.code, role: this.data.role };
        if (nickname) payload.nickname = nickname;
        if (avatarUrl) payload.avatarUrl = avatarUrl;

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
            if (err?.code === "nickname_required") {
              this.setData({ needsProfile: true });
              wx.showModal({
                title: "首次登录，请完善资料",
                content: "请选择头像并填写昵称，管理员将根据此信息审核您的账号。",
                showCancel: false,
              });
              return;
            }
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

  submitReviewerLogin() {
    if (this.data.reviewerLoading) return;
    const username = trimText(this.data.reviewerUsername);
    const password = String(this.data.reviewerPassword || "");
    const usernameCheck = validateTextLength({
      value: username,
      required: true,
      max: 64,
      label: "账号",
    });
    if (!usernameCheck.ok) {
      wx.showToast({ title: usernameCheck.message, icon: "none" });
      return;
    }
    if (!password || password.length > 128) {
      wx.showToast({ title: "请输入有效密码", icon: "none" });
      return;
    }

    this.setData({ reviewerLoading: true });
    request({
      url: "/auth/reviewer-login",
      method: "POST",
      data: { username, password },
    })
      .then((data) => {
        if (data?.token) {
          wx.setStorageSync("token", data.token);
          wx.setStorageSync("user", data.user);
          wx.reLaunch({ url: "/pages/dashboard/index" });
          return;
        }
        wx.showToast({ title: "登录失败", icon: "none" });
      })
      .catch((err) => {
        if (Number(err?.statusCode) === 404) {
          wx.showToast({ title: "服务端未部署审核登录接口", icon: "none" });
          return;
        }
        const msg = err?.error || "登录失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ reviewerLoading: false }));
  },
});
