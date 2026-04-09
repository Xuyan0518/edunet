const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");

Page({
  data: {
    student: {},
    exams: [],
    examName: "",
    examDate: "",
    examSubjects: [],
    customSubjectName: "",
    baseSubjects: [],
    editingExamId: null,
    isTeacher: false,
    loading: true,
    editingUpdatedAt: "",
    editingUpdatedBy: "",
    editingUpdatedAtText: "",
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    this.setData({ isTeacher: user?.role === "teacher" });
    this.studentId = query.studentId;
    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "error" });
      wx.navigateBack();
      return;
    }
    this.fetchStudent();
    this.fetchSubjects();
    this.fetchExams();
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((data) => this.setData({ student: data }))
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchSubjects() {
    request({ url: `/students/${this.studentId}/subjects/full` })
      .then((data) => {
        const subjects = (data || [])
          .map((entry) => entry?.subject?.name)
          .filter(Boolean);
        const unique = [];
        const seen = new Set();
        subjects.forEach((name) => {
          if (!seen.has(name)) {
            seen.add(name);
            unique.push(name);
          }
        });
        const baseSubjects = ["英文", ...unique];
        this.setData({
          baseSubjects,
          examSubjects: baseSubjects.map((name) => ({
            name,
            displayName: formatSubjectName(name),
            score: "",
            isCustom: false,
          })),
        });
      })
      .catch(() => {
        const baseSubjects = ["英文"];
        this.setData({
          baseSubjects,
          examSubjects: baseSubjects.map((name) => ({
            name,
            displayName: formatSubjectName(name),
            score: "",
            isCustom: false,
          })),
        });
      });
  },

  fetchExams() {
    this.setData({ loading: true });
    request({ url: `/students/${this.studentId}/exams` })
      .then((data) => {
        const exams = (data || []).map((exam) => ({
          ...exam,
          subjects: (exam.subjects || []).map((s) => ({
            ...s,
            displayName: formatSubjectName(s.name),
          })),
        }));
        this.setData({ exams });
      })
      .catch(() => wx.showToast({ title: "获取成绩失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onFieldInput(e) {
    const field = e.currentTarget.dataset.field;
    this.setData({ [field]: e.detail.value });
  },

  onSubjectScoreInput(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const examSubjects = [...this.data.examSubjects];
    if (!examSubjects[index]) return;
    examSubjects[index].score = value;
    this.setData({ examSubjects });
  },

  buildExamSubjectsForExam(exam) {
    const baseSubjects = this.data.baseSubjects || ["英文"];
    const map = new Map((exam?.subjects || []).map((s) => [s.name, s.score]));
    const list = baseSubjects.map((name) => ({
      name,
      displayName: formatSubjectName(name),
      score: map.get(name) || "",
      isCustom: false,
    }));
    (exam?.subjects || []).forEach((s) => {
      if (!baseSubjects.includes(s.name)) {
        list.push({
          name: s.name,
          displayName: formatSubjectName(s.name),
          score: s.score || "",
          isCustom: true,
        });
      }
    });
    return list;
  },

  startEditExam(e) {
    if (!this.data.isTeacher) return;
    const id = e.currentTarget.dataset.id;
    const exam = this.data.exams.find((x) => x.id === id);
    if (!exam) return;
    this.setData({
      editingExamId: id,
      examName: exam.name,
      examDate: exam.examDate || "",
      examSubjects: this.buildExamSubjectsForExam(exam),
      editingUpdatedAt: exam.updatedAt || "",
      editingUpdatedBy: exam.updatedByName || "",
      editingUpdatedAtText: exam.updatedAt ? formatChinaDateTime(new Date(exam.updatedAt)) : "",
    });
  },

  cancelEdit() {
    const baseSubjects = this.data.baseSubjects || ["英文"];
    this.setData({
      editingExamId: null,
      examName: "",
      examDate: "",
      customSubjectName: "",
      examSubjects: baseSubjects.map((n) => ({
        name: n,
        displayName: formatSubjectName(n),
        score: "",
        isCustom: false,
      })),
      editingUpdatedAt: "",
      editingUpdatedBy: "",
      editingUpdatedAtText: "",
    });
  },

  onExamDateChange(e) {
    this.setData({ examDate: e.detail.value });
  },

  addCustomSubject() {
    if (!this.data.isTeacher) return;
    const name = (this.data.customSubjectName || "").trim();
    if (!name) {
      wx.showToast({ title: "请输入科目名称", icon: "none" });
      return;
    }
    const exists = this.data.examSubjects.some((s) => s.name === name);
    if (exists) {
      wx.showToast({ title: "科目已存在", icon: "none" });
      return;
    }
    const examSubjects = [
      ...this.data.examSubjects,
      { name, displayName: formatSubjectName(name), score: "", isCustom: true },
    ];
    this.setData({ examSubjects, customSubjectName: "" });
  },

  removeCustomSubject(e) {
    if (!this.data.isTeacher) return;
    const index = e.currentTarget.dataset.index;
    const examSubjects = this.data.examSubjects.filter((_, i) => i !== index);
    this.setData({ examSubjects });
  },

  saveExam() {
    if (!this.data.isTeacher) return;
    const name = (this.data.examName || "").trim();
    const examDate = this.data.examDate || "";
    if (!name) {
      wx.showToast({ title: "请填写考试名称", icon: "none" });
      return;
    }
    if (!examDate) {
      wx.showToast({ title: "请选择考试日期", icon: "none" });
      return;
    }
    const subjects = (this.data.examSubjects || []).map((s) => ({
      name: s.name,
      score: (s.score || "").trim(),
    }));
    if (!subjects.length || subjects.some((s) => !s.score)) {
      wx.showToast({ title: "请填写所有科目成绩", icon: "none" });
      return;
    }
    const isEditing = !!this.data.editingExamId;
    const url = isEditing ? `/exams/${this.data.editingExamId}` : `/students/${this.studentId}/exams`;
    const method = isEditing ? "PUT" : "POST";
    const payload = isEditing
      ? { studentId: this.studentId, name, examDate, subjects, updatedAt: this.data.editingUpdatedAt }
      : { name, examDate, subjects };
    request({ url, method, data: payload })
      .then((data) => {
        const baseSubjects = this.data.baseSubjects || ["英文"];
        let exams = [...this.data.exams];
        if (isEditing) {
          exams = exams.map((e) => (e.id === data.id ? data : e));
        } else {
          exams = [data, ...exams];
        }
        exams = exams.map((exam) => ({
          ...exam,
          subjects: (exam.subjects || []).map((s) => ({
            ...s,
            displayName: formatSubjectName(s.name),
          })),
        }));
        this.setData({
          exams,
          editingExamId: null,
          examName: "",
          examDate: "",
          customSubjectName: "",
          examSubjects: baseSubjects.map((n) => ({
            name: n,
            displayName: formatSubjectName(n),
            score: "",
            isCustom: false,
          })),
          editingUpdatedAt: "",
          editingUpdatedBy: "",
          editingUpdatedAtText: "",
        });
        wx.showToast({ title: isEditing ? "已保存" : "已添加", icon: "success" });
      })
      .catch((err) => {
        if (showConflictModal(err, () => this.fetchExams())) return;
        wx.showToast({ title: isEditing ? "保存失败" : "添加失败", icon: "error" });
      });
  },

  deleteExam(e) {
    if (!this.data.isTeacher) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const exam = (this.data.exams || []).find((x) => x.id === id);
    const updatedAt = encodeURIComponent(exam?.updatedAt || "");
    wx.showModal({
      title: "确认删除",
      content: "删除考试后无法恢复，确定继续？",
      success: (res) => {
        if (!res.confirm) return;
        request({ url: `/exams/${id}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            const exams = this.data.exams.filter((g) => g.id !== id);
            this.setData({ exams });
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((err) => {
            if (showConflictModal(err, () => this.fetchExams())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },
});
