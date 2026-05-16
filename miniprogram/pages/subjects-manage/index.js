const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { showActionLockToast } = require("../../utils/actionLock");

const isEnglishSubject = (subject = {}) => {
  const name = String(subject.name || "").toLowerCase();
  const code = String(subject.code || "").toLowerCase();
  return (
    name.includes("english") ||
    name.includes("英文") ||
    name.includes("英语") ||
    code.includes("eng")
  );
};

Page({
  data: {
    loading: true,
    subjects: [],
    filtered: [],
    selectedIds: [],
    query: "",
  },

  onLoad(query) {
    this.studentId = query.studentId;
    this.fetchAll();
  },

  fetchAll() {
    if (!this.studentId) return;
    this.setData({ loading: true });
    Promise.all([
      request({ url: "/subjects" }),
      request({ url: `/students/${this.studentId}/subjects` }),
    ])
      .then(([subjects, assigned]) => {
        const ids = (assigned || [])
          .map((s) => (typeof s === "string" ? s : s.subjectId))
          .filter(Boolean);
        const merged = (subjects || []).map((s) => ({
          ...s,
          isRequired: isEnglishSubject(s),
          displayName: formatSubjectName(s.name),
          isSelected: ids.includes(s.id),
        }));
        const english = merged.find((s) => s.isRequired);
        const selectedIds = english && !ids.includes(english.id) ? [english.id, ...ids] : ids;
        const finalMerged = merged.map((s) => ({
          ...s,
          isSelected: selectedIds.includes(s.id),
        }));
        this.setData({
          subjects: finalMerged,
          filtered: finalMerged,
          selectedIds,
        });
      })
      .catch(() => wx.showToast({ title: "获取科目失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onSearch(e) {
    const query = (e.detail.value || "").trim().toLowerCase();
    const filtered = this.data.subjects.filter(
      (s) =>
        s.name.toLowerCase().includes(query) ||
        (s.displayName || "").toLowerCase().includes(query) ||
        s.code.toLowerCase().includes(query) ||
        s.level.toLowerCase().includes(query)
    );
    this.setData({ query, filtered });
  },

  onCheckChange(e) {
    let selectedIds = e.detail.value;
    const english = this.data.subjects.find((s) => s.isRequired);
    if (english && !selectedIds.includes(english.id)) {
      selectedIds = [english.id, ...selectedIds];
    }
    const subjects = this.data.subjects.map((s) => ({
      ...s,
      isSelected: selectedIds.includes(s.id),
    }));
    const filtered = this.data.filtered.map((s) => ({
      ...s,
      isSelected: selectedIds.includes(s.id),
    }));
    this.setData({ selectedIds, subjects, filtered });
  },

  save() {
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
        wx.showToast({ title: err?.message || "保存失败", icon: "error" });
      });
  },
});
