const { request } = require("../../utils/api");

const roleLabels = {
  admin: "管理员",
  teacher: "教师",
  parent: "家长",
};

const roleOptions = [
  { value: "admin", label: "管理员" },
  { value: "teacher", label: "教师" },
  { value: "parent", label: "家长" },
];

const decoratePending = (user, role) => ({
  ...user,
  role,
  roleLabel: roleLabels[role] || role,
  displayLabel: user.displayName || user.name || "未命名用户",
  identityLabel: user.wechatOpenIdMasked || user.email || "未绑定微信",
});

const decorateUser = (user) => {
  const roleValues = (user.roles || []).map((role) => role.role);
  return {
    ...user,
    roleValues,
    roleText: roleValues.map((role) => roleLabels[role] || role).join("、") || "暂无角色",
    primaryRole: user.roles?.[0] || null,
  };
};

const decorateRoleOptions = (selectedRoles) =>
  roleOptions.map((option) => ({
    ...option,
    selected: selectedRoles.includes(option.value),
  }));

Page({
  data: {
    loading: true,
    saving: false,
    users: [],
    filteredUsers: [],
    pendingParents: [],
    pendingTeachers: [],
    pendingCount: 0,
    query: "",
    editingIdentityKey: "",
    draftRoles: [],
    draftRoleOptions: decorateRoleOptions([]),
  },

  onShow() {
    const user = wx.getStorageSync("user");
    if (user?.role !== "admin") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.reLaunch({ url: "/pages/login/index" });
      return;
    }
    this.fetchAll();
  },

  fetchAll() {
    this.setData({ loading: true });
    return Promise.all([
      request({ url: "/admin/users" }),
      request({ url: "/admin/pending" }),
    ])
      .then(([data, pending]) => {
        const users = (data?.users || []).map(decorateUser);
        const pendingParents = (pending?.parents || []).map((user) => decoratePending(user, "parent"));
        const pendingTeachers = (pending?.teachers || []).map((user) => decoratePending(user, "teacher"));
        this.setData({
          users,
          filteredUsers: this.filterUsers(users, this.data.query),
          pendingParents,
          pendingTeachers,
          pendingCount: pendingParents.length + pendingTeachers.length,
        });
      })
      .catch(() => wx.showToast({ title: "获取用户失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  fetchUsers() {
    return this.fetchAll();
  },

  filterUsers(users, query) {
    const normalized = (query || "").trim().toLowerCase();
    if (!normalized) return users;
    return users.filter((user) =>
      [user.displayName, user.roleText]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalized))
    );
  },

  onSearch(e) {
    const query = e.detail.value || "";
    this.setData({ query, filteredUsers: this.filterUsers(this.data.users, query) });
  },

  startEdit(e) {
    const index = Number(e.currentTarget.dataset.index);
    const user = this.data.filteredUsers[index];
    if (!user?.primaryRole) {
      wx.showToast({ title: "缺少用户身份", icon: "none" });
      return;
    }
    const draftRoles = [...user.roleValues];
    this.setData({
      editingIdentityKey: user.identityKey,
      draftRoles,
      draftRoleOptions: decorateRoleOptions(draftRoles),
    });
  },

  cancelEdit() {
    this.setData({
      editingIdentityKey: "",
      draftRoles: [],
      draftRoleOptions: decorateRoleOptions([]),
    });
  },

  toggleDraftRole(e) {
    const role = e.currentTarget.dataset.role;
    if (!role) return;
    const current = new Set(this.data.draftRoles);
    if (current.has(role)) current.delete(role);
    else current.add(role);
    const draftRoles = Array.from(current);
    this.setData({
      draftRoles,
      draftRoleOptions: decorateRoleOptions(draftRoles),
    });
  },

  saveRoles(e) {
    const index = Number(e.currentTarget.dataset.index);
    const user = this.data.filteredUsers[index];
    if (!user?.primaryRole) return;
    if (!this.data.draftRoles.length) {
      wx.showToast({ title: "至少保留一个角色", icon: "none" });
      return;
    }

    wx.showModal({
      title: "确认保存角色",
      content: `${user.displayName} 将拥有：${this.data.draftRoles.map((role) => roleLabels[role]).join("、")}`,
      success: (modal) => {
        if (!modal.confirm) return;
        this.setData({ saving: true });
        wx.showLoading({ title: "保存中" });
        request({
          url: "/admin/users/set-roles",
          method: "POST",
          data: {
            sourceRole: user.primaryRole.role,
            sourceId: user.primaryRole.id,
            roles: this.data.draftRoles,
          },
        })
          .then(() => {
            wx.showToast({ title: "已保存", icon: "success" });
            this.cancelEdit();
            this.fetchAll();
          })
          .catch((err) => {
            wx.showToast({ title: err?.error || "保存失败", icon: "none" });
          })
          .finally(() => {
            wx.hideLoading();
            this.setData({ saving: false });
          });
      },
    });
  },

  handleApprove(e) {
    const { id, role } = e.currentTarget.dataset;
    request({ url: "/admin/approve", method: "POST", data: { id, role } })
      .then(() => {
        wx.showToast({ title: "已批准", icon: "success" });
        return this.fetchAll();
      })
      .catch(() => wx.showToast({ title: "审批失败", icon: "error" }));
  },

  handleReject(e) {
    const { id, role } = e.currentTarget.dataset;
    wx.showModal({
      title: "确认拒绝",
      content: "拒绝后该用户将无法登录对应角色，确定继续？",
      success: (modal) => {
        if (!modal.confirm) return;
        request({ url: "/admin/reject", method: "POST", data: { id, role } })
          .then(() => {
            wx.showToast({ title: "已拒绝", icon: "success" });
            return this.fetchAll();
          })
          .catch(() => wx.showToast({ title: "操作失败", icon: "error" }));
      },
    });
  },
});
