const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { showActionLockToast } = require("../../utils/actionLock");

const trimText = (value, max = 120) => String(value == null ? "" : value).trim().slice(0, max);

const buildSubjectDisplay = (subject = {}) => {
  const zh = trimText(subject.chineseName || "", 120);
  const en = trimText(subject.englishName || "", 120);
  const fallback = trimText(subject.name || "", 200);
  const displayName = zh && en ? `${zh} (${en})` : (zh || en || fallback);
  return {
    ...subject,
    displayName: formatSubjectName(displayName || fallback || subject.code || "未命名科目"),
    metaName: displayName || fallback || subject.code || "",
  };
};

Page({
  data: {
    loading: true,
    saving: false,
    levels: [],
    filteredLevels: [],
    selectedIds: [],
    query: "",
    canManageCatalog: false,
    editLevelNames: [],
    activeLevelId: "",
    activeSubjectId: "",
    activeTopicId: "",
  },

  onLoad(query) {
    this.studentId = query.studentId;
    const user = wx.getStorageSync("user") || {};
    this.setData({ canManageCatalog: user.role === "teacher" || user.role === "admin" });
    this.fetchAll();
  },

  onShow() {
    if (this.shouldRefreshAfterEditor) {
      this.shouldRefreshAfterEditor = false;
      this.fetchAll();
    }
  },

  fetchAll() {
    if (!this.studentId) return;
    this.setData({ loading: true });
    Promise.all([
      request({ url: "/subjects/hierarchy" }),
      request({ url: `/students/${this.studentId}/subjects` }),
    ])
      .then(([hierarchy, assigned]) => {
        const selectedIds = Array.isArray(assigned)
          ? assigned.map((item) => (typeof item === "string" ? item : item?.subjectId)).filter(Boolean)
          : [];
        const levels = (hierarchy?.levels || []).map((level) => ({
          ...level,
          subjects: (level.subjects || [])
            .map(buildSubjectDisplay)
            .map((subject) => ({
              ...subject,
              isSelected: selectedIds.includes(subject.id),
              isRequired: !!subject.isRequired,
              topics: Array.isArray(subject.topics) ? subject.topics : [],
            })),
        }));
        const required = [];
        levels.forEach((level) => {
          level.subjects.forEach((subject) => {
            if (subject.isRequired && !selectedIds.includes(subject.id)) required.push(subject.id);
          });
        });
        const nextSelected = Array.from(new Set([...required, ...selectedIds]));
        levels.forEach((level) => {
          level.subjects = level.subjects.map((subject) => ({
            ...subject,
            isSelected: nextSelected.includes(subject.id),
          }));
        });
        this.setData({
          levels,
          filteredLevels: levels,
          selectedIds: nextSelected,
          editLevelNames: levels.map((level) => level.name),
        });
      })
      .catch((err) => {
        wx.showToast({ title: err?.error || "获取科目失败", icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  buildFilteredLevels() {
    const query = trimText(this.data.query).toLowerCase();
    if (!query) return this.data.levels;
    return this.data.levels
      .map((level) => ({
        ...level,
        subjects: (level.subjects || []).filter((subject) => {
          const text = `${subject.metaName || ""} ${subject.code || ""} ${subject.levelName || ""}`.toLowerCase();
          return text.includes(query);
        }),
      }))
      .filter((level) => level.subjects.length || String(level.name || "").toLowerCase().includes(query));
  },

  onSearch(e) {
    this.setData({ query: e.detail.value || "" }, () => {
      this.setData({ filteredLevels: this.buildFilteredLevels() });
    });
  },

  toggleLevelActions(e) {
    if (!this.data.canManageCatalog) return;
    const levelId = e.currentTarget.dataset.levelId || "";
    this.setData({
      activeLevelId: this.data.activeLevelId === levelId ? "" : levelId,
      activeSubjectId: "",
      activeTopicId: "",
    });
  },

  toggleSubjectActions(e) {
    if (!this.data.canManageCatalog) return;
    const subjectId = e.currentTarget.dataset.subjectId || "";
    this.setData({
      activeSubjectId: this.data.activeSubjectId === subjectId ? "" : subjectId,
      activeTopicId: "",
    });
  },

  toggleTopicActions(e) {
    if (!this.data.canManageCatalog) return;
    const topicId = e.currentTarget.dataset.topicId || "";
    this.setData({ activeTopicId: this.data.activeTopicId === topicId ? "" : topicId });
  },

  onCheckChange(e) {
    let selectedIds = Array.isArray(e.detail.value) ? e.detail.value : [];
    const requiredIds = [];
    this.data.levels.forEach((level) => {
      level.subjects.forEach((subject) => {
        if (subject.isRequired) requiredIds.push(subject.id);
      });
    });
    selectedIds = Array.from(new Set([...requiredIds, ...selectedIds]));

    const levels = this.data.levels.map((level) => ({
      ...level,
      subjects: level.subjects.map((subject) => ({
        ...subject,
        isSelected: selectedIds.includes(subject.id),
      })),
    }));
    this.setData({ selectedIds, levels }, () => {
      this.setData({ filteredLevels: this.buildFilteredLevels() });
    });
  },

  save() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    request({
      url: `/students/${this.studentId}/subjects`,
      method: "PUT",
      data: { subjectIds: this.data.selectedIds },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        wx.navigateBack();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.error || err?.message || "保存失败", icon: "none" });
      })
      .finally(() => this.setData({ saving: false }));
  },

  addLevel() {
    if (!this.data.canManageCatalog) return;
    wx.showModal({
      title: "新增层级",
      editable: true,
      placeholderText: "例如：Sec 1 / O-Level / IB",
      success: (res) => {
        if (!res.confirm) return;
        const name = trimText(res.content, 64);
        if (!name) {
          wx.showToast({ title: "层级名称不能为空", icon: "none" });
          return;
        }
        request({
          url: "/subject-levels",
          method: "POST",
          data: { name },
        })
          .then(() => {
            wx.showToast({ title: "层级已新增", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "新增失败", icon: "none" });
          });
      },
    });
  },

  editLevel(e) {
    if (!this.data.canManageCatalog) return;
    const levelId = e.currentTarget.dataset.levelId;
    const level = this.data.levels.find((item) => item.id === levelId);
    if (!level) return;
    wx.showModal({
      title: "修改层级名称",
      editable: true,
      placeholderText: "请输入层级名称",
      content: level.name,
      success: (res) => {
        if (!res.confirm) return;
        const name = trimText(res.content, 64);
        if (!name) {
          wx.showToast({ title: "层级名称不能为空", icon: "none" });
          return;
        }
        request({
          url: `/subject-levels/${levelId}`,
          method: "PUT",
          data: {
            name,
            description: level.description || "",
            sortOrder: Number(level.sortOrder || 0),
            isActive: true,
          },
        })
          .then(() => {
            wx.showToast({ title: "已更新", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "更新失败", icon: "none" });
          });
      },
    });
  },

  deleteLevel(e) {
    if (!this.data.canManageCatalog) return;
    const levelId = e.currentTarget.dataset.levelId;
    wx.showModal({
      title: "删除层级",
      content: "仅可删除空层级，是否继续？",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/subject-levels/${levelId}`,
          method: "DELETE",
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "删除失败", icon: "none" });
          });
      },
    });
  },

  addSubject(e) {
    if (!this.data.canManageCatalog) return;
    const levelId = e.currentTarget.dataset.levelId;
    this.shouldRefreshAfterEditor = true;
    wx.navigateTo({ url: `/pages/subject-editor/index?mode=create&levelId=${levelId}` });
  },

  editSubject(e) {
    if (!this.data.canManageCatalog) return;
    const subjectId = e.currentTarget.dataset.subjectId;
    if (!subjectId) return;
    this.shouldRefreshAfterEditor = true;
    wx.navigateTo({ url: `/pages/subject-editor/index?mode=edit&subjectId=${subjectId}` });
  },

  addTopic(e) {
    if (!this.data.canManageCatalog) return;
    const subjectId = e.currentTarget.dataset.subjectId;
    wx.showModal({
      title: "新增章节",
      editable: true,
      placeholderText: "章节名称",
      success: (res) => {
        if (!res.confirm) return;
        const title = trimText(res.content, 256);
        if (!title) {
          wx.showToast({ title: "章节名称不能为空", icon: "none" });
          return;
        }
        const code = trimText(title.toUpperCase().replace(/[^A-Z0-9]+/g, "_"), 64) || `TOPIC_${Date.now()}`;
        request({
          url: `/subjects/${subjectId}/topics`,
          method: "POST",
          data: {
            code,
            title,
            orderIndex: code,
            parentTopicId: null,
          },
        })
          .then(() => {
            wx.showToast({ title: "章节已新增", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "新增失败", icon: "none" });
          });
      },
    });
  },

  editTopic(e) {
    if (!this.data.canManageCatalog) return;
    const topicId = e.currentTarget.dataset.topicId;
    const code = e.currentTarget.dataset.topicCode;
    const title = e.currentTarget.dataset.topicTitle;
    const subjectId = e.currentTarget.dataset.subjectId;
    const parentTopicId = e.currentTarget.dataset.parentTopicId || null;
    const orderIndex = e.currentTarget.dataset.orderIndex || code;
    wx.showModal({
      title: "修改章节名称",
      editable: true,
      content: title || "",
      success: (res) => {
        if (!res.confirm) return;
        const nextTitle = trimText(res.content, 256);
        if (!nextTitle) {
          wx.showToast({ title: "章节名称不能为空", icon: "none" });
          return;
        }
        request({
          url: `/topics/${topicId}`,
          method: "PUT",
          data: {
            code,
            title: nextTitle,
            orderIndex,
            parentTopicId,
            subjectId,
          },
        })
          .then(() => {
            wx.showToast({ title: "已更新", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "更新失败", icon: "none" });
          });
      },
    });
  },

  deleteTopic(e) {
    if (!this.data.canManageCatalog) return;
    const topicId = e.currentTarget.dataset.topicId;
    wx.showModal({
      title: "删除章节",
      content: "如果该章节已有学习进度或子章节，将无法删除。",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/topics/${topicId}`,
          method: "DELETE",
        })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.error || "删除失败", icon: "none" });
          });
      },
    });
  },
});
