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

const WEEKDAYS = [
  { value: 0, label: "周日" },
  { value: 1, label: "周一" },
  { value: 2, label: "周二" },
  { value: 3, label: "周三" },
  { value: 4, label: "周四" },
  { value: 5, label: "周五" },
  { value: 6, label: "周六" },
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
    savingTasks: false,
    savingStudy: false,
    tasks: [],
    fieldOptions: FIELD_OPTIONS,
    presets: TASK_TYPE_PRESETS,
    showPresetPicker: false,
    studyEnabled: true,
    studyStartTime: "18:00",
    studyEndTime: "21:00",
    weekdays: WEEKDAYS.map((day) => ({ ...day, selected: day.value >= 0 && day.value <= 4 })),
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
    Promise.all([
      request({ url: "/admin/english-tasks" }),
      request({ url: "/study-settings" }),
    ])
      .then(([tasksData, study]) => {
        const selectedDays = new Set(study?.days || [0, 1, 2, 3, 4]);
        this.setData({
          tasks: normalizeEnglishTaskConfig(tasksData?.tasks || DEFAULT_ENGLISH_TASKS),
          studyEnabled: study?.enabled !== false,
          studyStartTime: study?.startTime || "18:00",
          studyEndTime: study?.endTime || "21:00",
          weekdays: WEEKDAYS.map((day) => ({ ...day, selected: selectedDays.has(day.value) })),
        });
      })
      .catch((err) => wx.showToast({ title: err?.error || "加载失败", icon: "none" }))
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
    if (!Number.isInteger(index) || !this.data.tasks[index]) return;
    this.updateTask(index, { enabled: !this.data.tasks[index].enabled });
  },

  onChineseNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.updateTask(index, { chineseName: e.detail.value || "" });
  },

  onEnglishNameInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.updateTask(index, { englishName: e.detail.value || "" });
  },

  onWeeklyTargetInput(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    this.updateTask(index, { weeklyTargetCount: e.detail.value });
  },

  onFieldToggle(e) {
    const index = Number(e.currentTarget.dataset.index);
    const field = String(e.currentTarget.dataset.field || "");
    if (!Number.isInteger(index) || !FIELD_KEYS.includes(field)) return;
    const current = this.data.tasks[index];
    const currentFields = Array.isArray(current.enabledFields) ? [...current.enabledFields] : [];
    const exists = currentFields.includes(field);
    const nextFields = exists
      ? currentFields.filter((item) => item !== field)
      : [...currentFields, field];
    this.updateTask(index, { enabledFields: nextFields.length ? nextFields : ["practiceCount"] });
  },

  removeTask(e) {
    const index = Number(e.currentTarget.dataset.index);
    if (!Number.isInteger(index)) return;
    const tasks = this.data.tasks.filter((_, i) => i !== index).map((task, i) => ({ ...task, sortOrder: i }));
    this.setData({ tasks });
  },

  moveTask(e) {
    const index = Number(e.currentTarget.dataset.index);
    const direction = e.currentTarget.dataset.direction;
    if (!Number.isInteger(index)) return;
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= this.data.tasks.length) return;
    const tasks = [...this.data.tasks];
    const [item] = tasks.splice(index, 1);
    tasks.splice(target, 0, item);
    this.setData({ tasks: tasks.map((task, i) => ({ ...task, sortOrder: i })) });
  },

  openAddTaskPicker() {
    this.setData({ showPresetPicker: true });
  },

  closeAddTaskPicker() {
    this.setData({ showPresetPicker: false });
  },

  async pickPresetTask(e) {
    const presetIndex = Number(e.currentTarget.dataset.index);
    const preset = TASK_TYPE_PRESETS[presetIndex];
    this.closeAddTaskPicker();
    if (!preset) return;
    if (preset.key === "custom") {
      const names = await this.promptCustomNames();
      if (!names) return;
      this.setData({ tasks: [...this.data.tasks, buildTaskFromPreset(preset, this.data.tasks.length, names)] });
      return;
    }
    this.setData({ tasks: [...this.data.tasks, buildTaskFromPreset(preset, this.data.tasks.length)] });
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
            success: (second) => resolve({ chineseName, englishName: second.confirm ? (second.content || "").trim() : "" }),
            fail: () => resolve({ chineseName, englishName: "" }),
          });
        },
        fail: () => resolve(null),
      });
    });
  },

  saveTasks() {
    const tasks = normalizeEnglishTaskConfig(this.data.tasks).map((task, index) => ({ ...task, sortOrder: index }));
    if (!tasks.length) {
      wx.showToast({ title: "至少保留一个任务", icon: "none" });
      return;
    }
    this.setData({ savingTasks: true });
    request({ url: "/admin/english-tasks", method: "PUT", data: { tasks } })
      .then((data) => {
        this.setData({ tasks: normalizeEnglishTaskConfig(data?.tasks || tasks) });
        wx.showToast({ title: "已保存", icon: "success" });
      })
      .catch((err) => wx.showToast({ title: err?.error || "保存失败", icon: "none" }))
      .finally(() => this.setData({ savingTasks: false }));
  },

  resetTasks() {
    request({ url: "/admin/english-tasks/reset", method: "POST" })
      .then((data) => {
        this.setData({ tasks: normalizeEnglishTaskConfig(data?.tasks || DEFAULT_ENGLISH_TASKS) });
        wx.showToast({ title: "已恢复默认", icon: "success" });
      })
      .catch((err) => wx.showToast({ title: err?.error || "重置失败", icon: "none" }));
  },

  onStudyEnabledChange(e) {
    this.setData({ studyEnabled: !!e.detail.value });
  },

  onStudyStartChange(e) {
    this.setData({ studyStartTime: e.detail.value || "18:00" });
  },

  onStudyEndChange(e) {
    this.setData({ studyEndTime: e.detail.value || "21:00" });
  },

  toggleWeekday(e) {
    const value = Number(e.currentTarget.dataset.value);
    const weekdays = this.data.weekdays.map((day) =>
      day.value === value ? { ...day, selected: !day.selected } : day
    );
    this.setData({ weekdays });
  },

  saveStudySettings() {
    const days = this.data.weekdays.filter((day) => day.selected).map((day) => day.value);
    this.setData({ savingStudy: true });
    request({
      url: "/admin/study-settings",
      method: "PUT",
      data: {
        enabled: this.data.studyEnabled,
        days,
        startTime: this.data.studyStartTime,
        endTime: this.data.studyEndTime,
      },
    })
      .then(() => wx.showToast({ title: "已保存", icon: "success" }))
      .catch((err) => wx.showToast({ title: err?.error || "保存失败", icon: "none" }))
      .finally(() => this.setData({ savingStudy: false }));
  },
});
