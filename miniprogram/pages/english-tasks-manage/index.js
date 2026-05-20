const { request } = require("../../utils/api");
const {
  DEFAULT_ENGLISH_TASKS,
  TASK_TYPE_PRESETS,
  FIELD_KEYS,
  normalizeEnglishTaskConfig,
} = require("../../utils/englishTasks");

const FIELD_OPTIONS = [
  { value: "practiceCount", label: "练习数" },
  { value: "score", label: "分数" },
  { value: "problems", label: "出现的问题" },
];

const clampWeeklyTarget = (value) => {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 500) return 500;
  return Math.floor(n);
};

const buildTaskFromPreset = (preset, index, customNames = {}) => {
  const chineseName = (customNames.chineseName || preset.chineseName || "").trim();
  const englishName = (customNames.englishName || preset.englishName || "").trim();
  return {
    id: `${preset.key}_${Date.now()}_${index}`,
    key: preset.key === "custom" ? `custom_${Date.now()}_${index}` : preset.key,
    chineseName,
    englishName,
    displayName: chineseName && englishName ? `${chineseName} (${englishName})` : (chineseName || englishName || preset.key),
    weeklyTargetCount: preset.key === "essay" ? 1 : (preset.key === "vocab" ? 50 : 5),
    enabled: true,
    enabledFields: ["practiceCount", "score", "problems"],
    sortOrder: index,
  };
};

Page({
  data: {
    loading: true,
    saving: false,
    isDefault: true,
    tasks: [],
    fieldOptions: FIELD_OPTIONS,
    presets: TASK_TYPE_PRESETS,
    studentName: "",
    canEdit: false,
  },

  onLoad(query) {
    this.studentId = query.studentId || "";
    const user = wx.getStorageSync("user") || {};
    this.setData({ canEdit: user.role === "teacher" || user.role === "admin" });
    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "none" });
      wx.navigateBack();
      return;
    }
    this.fetchStudent();
    this.fetchConfig();
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((student) => this.setData({ studentName: student?.name || "" }))
      .catch(() => {});
  },

  fetchConfig() {
    this.setData({ loading: true });
    request({ url: `/students/${this.studentId}/english-tasks` })
      .then((data) => {
        const tasks = normalizeEnglishTaskConfig(data?.tasks || DEFAULT_ENGLISH_TASKS);
        this.setData({
          isDefault: !!data?.isDefault,
          tasks,
        });
      })
      .catch((err) => {
        wx.showToast({ title: err?.error || "加载失败", icon: "none" });
      })
      .finally(() => this.setData({ loading: false }));
  },

  updateTask(index, patch) {
    const tasks = [...this.data.tasks];
    if (!tasks[index]) return;
    tasks[index] = { ...tasks[index], ...patch };
    if (patch.chineseName !== undefined || patch.englishName !== undefined) {
      const zh = (tasks[index].chineseName || "").trim();
      const en = (tasks[index].englishName || "").trim();
      tasks[index].displayName = zh && en ? `${zh} (${en})` : (zh || en || tasks[index].key);
    }
    tasks[index].weeklyTargetCount = clampWeeklyTarget(tasks[index].weeklyTargetCount);
    tasks[index].sortOrder = index;
    this.setData({ tasks });
  },

  onToggleEnabled(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateTask(index, { enabled: !this.data.tasks[index].enabled });
  },

  onChineseNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateTask(index, { chineseName: e.detail.value || "" });
  },

  onEnglishNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateTask(index, { englishName: e.detail.value || "" });
  },

  onWeeklyTargetInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    this.updateTask(index, { weeklyTargetCount: e.detail.value });
  },

  onFieldChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const values = Array.isArray(e.detail.value) ? e.detail.value : [];
    const normalized = FIELD_KEYS.filter((field) => values.includes(field));
    this.updateTask(index, { enabledFields: normalized.length ? normalized : ["practiceCount"] });
  },

  removeTask(e) {
    const index = Number(e.currentTarget.dataset.index);
    const tasks = this.data.tasks.filter((_, i) => i !== index).map((task, i) => ({ ...task, sortOrder: i }));
    this.setData({ tasks });
  },

  moveTask(e) {
    const index = Number(e.currentTarget.dataset.index);
    const direction = e.currentTarget.dataset.direction;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= this.data.tasks.length) return;
    const tasks = [...this.data.tasks];
    const [item] = tasks.splice(index, 1);
    tasks.splice(target, 0, item);
    this.setData({ tasks: tasks.map((task, i) => ({ ...task, sortOrder: i })) });
  },

  addTask() {
    wx.showActionSheet({
      itemList: TASK_TYPE_PRESETS.map((item) => `${item.chineseName} (${item.englishName})`),
      success: async (res) => {
        const preset = TASK_TYPE_PRESETS[res.tapIndex];
        if (!preset) return;
        if (preset.key === "custom") {
          const names = await this.promptCustomNames();
          if (!names) return;
          const next = buildTaskFromPreset(preset, this.data.tasks.length, names);
          this.setData({ tasks: [...this.data.tasks, next] });
          return;
        }
        const next = buildTaskFromPreset(preset, this.data.tasks.length);
        this.setData({ tasks: [...this.data.tasks, next] });
      },
    });
  },

  promptCustomNames() {
    return new Promise((resolve) => {
      wx.showModal({
        title: "自定义任务名称",
        editable: true,
        placeholderText: "请输入中文名",
        success: (first) => {
          if (!first.confirm) return resolve(null);
          const chineseName = (first.content || "").trim();
          if (!chineseName) {
            wx.showToast({ title: "名称不能为空", icon: "none" });
            return resolve(null);
          }
          wx.showModal({
            title: "请输入英文名（可选）",
            editable: true,
            placeholderText: "例如: Listening Drill",
            success: (second) => {
              if (!second.confirm) return resolve({ chineseName, englishName: "" });
              const englishName = (second.content || "").trim();
              resolve({ chineseName, englishName });
            },
            fail: () => resolve({ chineseName, englishName: "" }),
          });
        },
        fail: () => resolve(null),
      });
    });
  },

  save() {
    if (this.data.saving) return;
    if (!this.data.canEdit) {
      wx.showToast({ title: "无权限", icon: "none" });
      return;
    }
    if (!this.data.tasks.length) {
      wx.showToast({ title: "至少保留一个任务", icon: "none" });
      return;
    }
    const tasks = normalizeEnglishTaskConfig(this.data.tasks).map((task, index) => ({
      ...task,
      sortOrder: index,
    }));
    const invalid = tasks.find((task) => !String(task.displayName || "").trim());
    if (invalid) {
      wx.showToast({ title: "任务名不能为空", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    request({
      url: `/students/${this.studentId}/english-tasks`,
      method: "PUT",
      data: { tasks },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        setTimeout(() => wx.navigateBack(), 300);
      })
      .catch((err) => {
        wx.showToast({ title: err?.error || "保存失败", icon: "none" });
      })
      .finally(() => this.setData({ saving: false }));
  },

  resetDefault() {
    wx.showModal({
      title: "重置确认",
      content: "将恢复默认英文项目，是否继续？",
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/students/${this.studentId}/english-tasks/reset`,
          method: "POST",
        })
          .then((data) => {
            this.setData({
              tasks: normalizeEnglishTaskConfig(data?.tasks || DEFAULT_ENGLISH_TASKS),
              isDefault: true,
            });
            wx.showToast({ title: "已重置", icon: "success" });
          })
          .catch((err) => wx.showToast({ title: err?.error || "重置失败", icon: "none" }));
      },
    });
  },
});
