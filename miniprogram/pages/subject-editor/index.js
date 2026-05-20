const { request } = require("../../utils/api");
const { showActionLockToast } = require("../../utils/actionLock");

const trimText = (value, max = 200) => String(value == null ? "" : value).trim().slice(0, max);
const toInt = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(0, Math.floor(n)) : fallback;
};

const codeFromName = (value, fallback = "") => {
  const code = trimText(value, 120).toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  return code || fallback;
};

const flattenTopics = (topics = [], parentTopicId = null, out = []) => {
  (topics || []).forEach((topic) => {
    if (!topic || typeof topic !== "object") return;
    out.push({
      id: topic.id || "",
      code: trimText(topic.code, 64),
      title: trimText(topic.title, 256),
      orderIndex: trimText(topic.orderIndex, 32) || trimText(topic.code, 64),
      parentTopicId,
      _deleted: false,
    });
    if (Array.isArray(topic.children) && topic.children.length) {
      flattenTopics(topic.children, topic.id || null, out);
    }
  });
  return out;
};

Page({
  data: {
    loading: true,
    saving: false,
    deleting: false,
    mode: "create",
    subjectId: "",
    levels: [],
    levelOptions: [],
    levelIndex: 0,
    code: "",
    chineseName: "",
    englishName: "",
    sortOrder: 0,
    isRequired: false,
    topics: [],
  },

  onLoad(query) {
    this.mode = query?.mode === "edit" ? "edit" : "create";
    this.subjectId = query?.subjectId || "";
    this.initialLevelId = query?.levelId || "";
    this.setData({ mode: this.mode, subjectId: this.subjectId });
    this.fetchCatalog();
  },

  async fetchCatalog() {
    this.setData({ loading: true });
    try {
      const hierarchy = await request({ url: "/subjects/hierarchy" });
      const levels = Array.isArray(hierarchy?.levels) ? hierarchy.levels : [];
      const levelOptions = levels.map((item) => item.name || "未命名层级");

      if (!levels.length) {
        wx.showToast({ title: "暂无可用层级", icon: "none" });
        this.setData({ levels: [], levelOptions: [], loading: false });
        return;
      }

      if (this.mode === "edit") {
        let foundSubject = null;
        let foundLevelIndex = 0;
        levels.forEach((level, idx) => {
          const found = (level.subjects || []).find((subject) => subject.id === this.subjectId);
          if (found && !foundSubject) {
            foundSubject = { ...found, levelId: level.id };
            foundLevelIndex = idx;
          }
        });
        if (!foundSubject) {
          wx.showToast({ title: "科目不存在", icon: "none" });
          wx.navigateBack();
          return;
        }
        const topics = flattenTopics(foundSubject.topics || []);
        this.setData({
          levels,
          levelOptions,
          levelIndex: foundLevelIndex,
          code: trimText(foundSubject.code, 64),
          chineseName: trimText(foundSubject.chineseName || foundSubject.name, 120),
          englishName: trimText(foundSubject.englishName, 120),
          sortOrder: toInt(foundSubject.sortOrder, 0),
          isRequired: foundSubject.isRequired === true,
          topics,
        });
      } else {
        const levelIndex = Math.max(0, levels.findIndex((level) => level.id === this.initialLevelId));
        this.setData({
          levels,
          levelOptions,
          levelIndex: levelIndex >= 0 ? levelIndex : 0,
          topics: [],
        });
      }
    } catch (err) {
      wx.showToast({ title: err?.error || "加载失败", icon: "none" });
    } finally {
      this.setData({ loading: false });
    }
  },

  onLevelChange(e) {
    this.setData({ levelIndex: Number(e.detail.value || 0) });
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value || "" });
  },

  onRequiredChange(e) {
    const checked = Array.isArray(e.detail.value) && e.detail.value.includes("required");
    this.setData({ isRequired: checked });
  },

  addTopicDraft() {
    const topics = [...this.data.topics, {
      id: "",
      code: "",
      title: "",
      orderIndex: "",
      parentTopicId: null,
      _deleted: false,
    }];
    this.setData({ topics });
  },

  onTopicInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = e.currentTarget.dataset.field;
    const topics = [...this.data.topics];
    if (!topics[index] || !field) return;
    topics[index][field] = e.detail.value || "";
    this.setData({ topics });
  },

  removeTopicDraft(e) {
    const index = Number(e.currentTarget.dataset.index);
    const topics = [...this.data.topics];
    const topic = topics[index];
    if (!topic) return;
    if (topic.id) {
      topics[index] = { ...topic, _deleted: true };
    } else {
      topics.splice(index, 1);
    }
    this.setData({ topics });
  },

  async saveSubject() {
    if (this.data.saving) return;
    const levels = this.data.levels || [];
    const level = levels[this.data.levelIndex] || levels[0];
    if (!level?.id) {
      wx.showToast({ title: "请选择层级", icon: "none" });
      return;
    }

    const chineseName = trimText(this.data.chineseName, 120);
    const englishName = trimText(this.data.englishName, 120);
    const name = chineseName || englishName;
    if (!name) {
      wx.showToast({ title: "科目名称不能为空", icon: "none" });
      return;
    }
    const code = codeFromName(this.data.code || englishName || chineseName, `SUB_${Date.now()}`);
    const sortOrder = toInt(this.data.sortOrder, 0);

    this.setData({ saving: true });
    try {
      let subjectId = this.subjectId;
      const payload = {
        code,
        name,
        chineseName,
        englishName,
        levelId: level.id,
        isRequired: this.data.isRequired === true,
        sortOrder,
        isActive: true,
      };

      if (this.mode === "edit") {
        await request({
          url: `/subjects/${subjectId}`,
          method: "PUT",
          data: payload,
        });
      } else {
        const created = await request({
          url: "/subjects",
          method: "POST",
          data: payload,
        });
        subjectId = created?.id || "";
      }

      if (!subjectId) {
        wx.showToast({ title: "科目保存失败", icon: "none" });
        this.setData({ saving: false });
        return;
      }

      for (const row of this.data.topics || []) {
        const title = trimText(row.title, 256);
        const rowCode = codeFromName(row.code || title, "");
        const orderIndex = trimText(row.orderIndex, 32) || rowCode;

        if (row._deleted && row.id) {
          await request({ url: `/topics/${row.id}`, method: "DELETE" });
          continue;
        }

        if (!title) continue;
        if (!rowCode) continue;

        if (row.id) {
          await request({
            url: `/topics/${row.id}`,
            method: "PUT",
            data: {
              code: rowCode,
              title,
              orderIndex,
              parentTopicId: row.parentTopicId || null,
              subjectId,
            },
          });
        } else {
          await request({
            url: `/subjects/${subjectId}/topics`,
            method: "POST",
            data: {
              code: rowCode,
              title,
              orderIndex,
              parentTopicId: row.parentTopicId || null,
            },
          });
        }
      }

      wx.showToast({ title: "已保存", icon: "success" });
      setTimeout(() => wx.navigateBack(), 250);
    } catch (err) {
      if (showActionLockToast(err)) return;
      wx.showToast({ title: err?.error || "保存失败", icon: "none" });
    } finally {
      this.setData({ saving: false });
    }
  },

  deleteSubject() {
    if (this.mode !== "edit" || !this.subjectId || this.data.deleting) return;
    wx.showModal({
      title: "删除科目",
      content: "删除后该科目会从全局科目列表隐藏，并从学生选科中移除。",
      success: async (res) => {
        if (!res.confirm) return;
        this.setData({ deleting: true });
        try {
          await request({ url: `/subjects/${this.subjectId}`, method: "DELETE" });
          wx.showToast({ title: "已删除", icon: "success" });
          setTimeout(() => wx.navigateBack(), 250);
        } catch (err) {
          if (showActionLockToast(err)) return;
          wx.showToast({ title: err?.error || "删除失败", icon: "none" });
        } finally {
          this.setData({ deleting: false });
        }
      },
    });
  },
});
