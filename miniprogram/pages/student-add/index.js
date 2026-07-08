const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { LIMITS, trimText } = require("../../utils/validation");

const canonicalSubjectKey = (subject = {}) => {
  const name = String(subject.name || "").trim().toLowerCase();
  const code = String(subject.code || "").trim().toLowerCase();
  if (
    name === "english" ||
    name.includes(" english") ||
    name.includes("英文") ||
    name.includes("英语") ||
    code.includes("eng")
  ) {
    return "__english__";
  }
  return `${code}::${name}`;
};

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
    pageTitle: "新增学生",
    pageSubtitle: "填写信息并分配科目",
    isEdit: false,
    studentId: "",
    name: "",
    grade: "",
    gradeOptions: ["中一", "中二", "中三", "中四"],
    gradeIndex: 0,
    parents: [],
    selectedParentIds: [],
    selectedParentNames: "不指定",
    subjects: [],
    filteredSubjects: [],
    selectedIds: [],
    saving: false,
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    if (user?.role !== "teacher") {
      wx.showToast({ title: "无权限", icon: "error" });
      wx.navigateBack();
      return;
    }
    const studentId = query?.id || "";
    const isEdit = !!studentId;
    this.assignedSubjectIds = [];
    this.pendingParentIds = [];
    this.setData({
      isEdit,
      studentId,
      pageTitle: isEdit ? "编辑学生" : "新增学生",
      pageSubtitle: isEdit ? "更新信息与科目" : "填写信息并分配科目",
    });
    this.fetchParents();
    this.fetchSubjects();
    if (isEdit) {
      this.fetchStudent();
      this.fetchAssignedSubjects();
    }
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onGradeChange(e) {
    const index = Number(e.detail.value);
    const grade = this.data.gradeOptions[index] || "";
    this.setData({ gradeIndex: index, grade });
  },

  fetchParents() {
    request({ url: "/parents" })
      .then((data) => {
        const approved = (data || []).filter((p) => p.status === "approved");
        const selectedParentIds = this.pendingParentIds.length
          ? this.pendingParentIds.filter((id) => approved.some((p) => p.id === id))
          : this.data.selectedParentIds;
        this.pendingParentIds = [];
        const parents = approved.map((parent) => ({
          ...parent,
          isSelected: selectedParentIds.includes(parent.id),
        }));
        this.setData({ parents, selectedParentIds }, () => this.updateSelectedParentNames());
      })
      .catch(() => wx.showToast({ title: "获取家长失败", icon: "error" }));
  },

  onParentCheckChange(e) {
    const selectedParentIds = e.detail.value || [];
    const parents = this.data.parents.map((parent) => ({
      ...parent,
      isSelected: selectedParentIds.includes(parent.id),
    }));
    this.setData({ selectedParentIds, parents }, () => this.updateSelectedParentNames());
  },

  updateSelectedParentNames() {
    const names = this.data.selectedParentIds
      .map((id) => this.data.parents.find((parent) => parent.id === id)?.name)
      .filter(Boolean);
    this.setData({ selectedParentNames: names.length ? names.join("、") : "不指定" });
  },

  fetchSubjects() {
    request({ url: "/subjects" })
      .then((data) => {
        const unique = [];
        const seen = new Set();
        (data || []).forEach((s) => {
          const key = canonicalSubjectKey(s);
          if (seen.has(key)) return;
          seen.add(key);
          unique.push(s);
        });
        const subjects = unique.map((s) => ({
          ...s,
          isRequired: isEnglishSubject(s),
          displayName: formatSubjectName(s.name),
          isSelected: false,
        }));
        const english = subjects.find((s) => s.isRequired);
        const selectedIds = english ? [english.id] : [];
        const withSelected = subjects.map((s) => ({
          ...s,
          isSelected: selectedIds.includes(s.id),
        }));
        this.setData({ subjects: withSelected, filteredSubjects: withSelected, selectedIds });
        if (this.assignedSubjectIds && this.assignedSubjectIds.length) {
          this.applyAssignedSubjects(this.assignedSubjectIds);
        }
      })
      .catch(() => wx.showToast({ title: "获取科目失败", icon: "error" }));
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
    this.setData({ filteredSubjects: filtered });
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
    const filteredSubjects = this.data.filteredSubjects.map((s) => ({
      ...s,
      isSelected: selectedIds.includes(s.id),
    }));
    this.setData({ selectedIds, subjects, filteredSubjects });
  },

  applyAssignedSubjects(ids = []) {
    const english = this.data.subjects.find((s) => s.isRequired);
    let nextIds = ids.slice();
    if (english && !nextIds.includes(english.id)) {
      nextIds = [english.id, ...nextIds];
    }
    const subjects = this.data.subjects.map((s) => ({
      ...s,
      isSelected: nextIds.includes(s.id),
    }));
    const filteredSubjects = this.data.filteredSubjects.map((s) => ({
      ...s,
      isSelected: nextIds.includes(s.id),
    }));
    this.setData({ selectedIds: nextIds, subjects, filteredSubjects });
  },

  fetchAssignedSubjects() {
    const studentId = this.data.studentId;
    if (!studentId) return;
    request({ url: `/students/${studentId}/subjects` })
      .then((ids) => {
        this.assignedSubjectIds = ids || [];
        if (this.data.subjects.length) {
          this.applyAssignedSubjects(this.assignedSubjectIds);
        }
      })
      .catch(() => {
        this.assignedSubjectIds = [];
      });
  },

  fetchStudent() {
    const studentId = this.data.studentId;
    if (!studentId) return;
    request({ url: `/students/${studentId}` })
      .then((data) => {
        const parentIds = Array.isArray(data?.parentIds)
          ? data.parentIds
          : (data?.parentId ? [data.parentId] : []);
        const gradeRaw = String(data?.grade || "");
        const gradeMap = {
          "7": "中一",
          "8": "中二",
          "9": "中三",
          "10": "中四",
          初一: "中一",
          初二: "中二",
          初三: "中三",
          初四: "中四",
          中一: "中一",
          中二: "中二",
          中三: "中三",
          中四: "中四",
        };
        const mappedGrade = gradeMap[gradeRaw] || gradeRaw;
        const gradeIndex = Math.max(
          0,
          this.data.gradeOptions.indexOf(mappedGrade)
        );
        if (parentIds.length && !this.data.parents.length) this.pendingParentIds = parentIds;
        const parents = this.data.parents.map((parent) => ({
          ...parent,
          isSelected: parentIds.includes(parent.id),
        }));
        this.setData({
          name: data?.name || "",
          grade: mappedGrade || "",
          gradeIndex,
          selectedParentIds: parentIds,
          parents,
        }, () => this.updateSelectedParentNames());
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  save() {
    if (!this.data.name.trim() || !this.data.grade.trim()) {
      wx.showToast({ title: "请填写姓名和年级", icon: "none" });
      return;
    }
    if (trimText(this.data.name).length > 100) {
      wx.showToast({ title: "学生姓名过长", icon: "none" });
      return;
    }
    if ((this.data.selectedIds || []).length > LIMITS.examSubjectsMax) {
      wx.showToast({ title: "科目数量过多", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    const payload = {
      name: this.data.name.trim(),
      grade: this.data.grade.trim(),
      parentIds: this.data.selectedParentIds || [],
      parentId: (this.data.selectedParentIds || [])[0] || null,
    };
    const isEdit = this.data.isEdit;
    const requestConfig = isEdit
      ? { url: `/students/${this.data.studentId}`, method: "PUT", data: payload }
      : { url: "/students", method: "POST", data: payload };

    request(requestConfig)
      .then((student) => {
        const studentId = isEdit ? this.data.studentId : student.id;
        return request({
          url: `/students/${studentId}/subjects`,
          method: "PUT",
          data: { subjectIds: this.data.selectedIds },
        }).then(() => ({ ...student, id: studentId }));
      })
      .then((student) => {
        wx.showToast({ title: isEdit ? "已保存" : "已创建", icon: "success" });
        wx.redirectTo({ url: `/pages/student-detail/index?id=${student.id}` });
      })
      .catch(() => wx.showToast({ title: "保存失败", icon: "error" }))
      .finally(() => this.setData({ saving: false }));
  },
});
