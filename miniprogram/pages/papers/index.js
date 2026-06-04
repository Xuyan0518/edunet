const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
const { formatChinaDate } = require("../../utils/chinaDate");
const { showActionLockToast } = require("../../utils/actionLock");
const { LIMITS, trimText, isYmd } = require("../../utils/validation");

const toNumOrNull = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const percentageToGrade = (pct) => {
  if (pct == null || !Number.isFinite(pct)) return "";
  if (pct >= 75) return "A1";
  if (pct >= 70) return "A2";
  if (pct >= 65) return "B3";
  if (pct >= 60) return "B4";
  if (pct >= 55) return "C5";
  if (pct >= 50) return "C6";
  if (pct >= 45) return "D7";
  if (pct >= 40) return "E8";
  return "F9";
};

const derivePaperScoreMeta = (paper = {}) => {
  const score = toNumOrNull(paper.score);
  const total = toNumOrNull(paper.total);
  const scoreText = typeof paper.score === "string" ? paper.score.trim() : "";
  const slash = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(scoreText);
  const parsedScore = slash ? toNumOrNull(slash[1]) : score;
  const parsedTotal = slash ? toNumOrNull(slash[2]) : total;
  const percentage = Number.isFinite(Number(paper.percentage))
    ? Number(paper.percentage)
    : (parsedScore != null && parsedTotal != null && parsedTotal > 0
      ? Math.round((parsedScore / parsedTotal) * 10000) / 100
      : (parsedScore != null && parsedScore >= 0 && parsedScore <= 100 ? parsedScore : null));
  const grade = (paper.grade || "").trim() || percentageToGrade(percentage);
  return {
    percentageDisplay: percentage == null ? "" : String(percentage),
    gradeDisplay: grade || "",
  };
};

const buildGroups = (papers = []) => {
  const map = {};
  papers.forEach((p) => {
    const typeName = p.typeName || "未分类类型";
    const subjectName = p.subjectName || "未指定科目";
    const subjectDisplayName = formatSubjectName(subjectName);
    const schoolName = p.schoolName || "未指定学校";
    if (!map[typeName]) map[typeName] = {};
    if (!map[typeName][subjectName]) map[typeName][subjectName] = {};
    if (!map[typeName][subjectName][schoolName]) map[typeName][subjectName][schoolName] = [];
    map[typeName][subjectName][schoolName].push({ ...p, subjectDisplayName });
  });
  return Object.keys(map).map((typeName) => ({
    typeName,
    subjects: Object.keys(map[typeName]).map((subjectName) => ({
      subjectName,
      subjectDisplayName: formatSubjectName(subjectName),
      schools: Object.keys(map[typeName][subjectName]).map((schoolName) => ({
        schoolName,
        papers: map[typeName][subjectName][schoolName],
      })),
    })),
  }));
};

Page({
  data: {
    student: {},
    isTeacher: false,
    loading: true,
    papers: [],
    grouped: [],
    subjects: [],
    subjectOptions: ["请选择科目"],
    subjectIndex: 0,
    paperTypes: [],
    paperTypeOptions: ["请选择类型"],
    paperSchools: [],
    paperSchoolOptions: ["请选择学校"],
    typeIndex: 0,
    schoolIndex: 0,
    date: "",
    score: "",
    total: "",
    description: "",
    strengths: "",
    improvements: "",
    editingId: "",
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
    this.setData({ date: formatChinaDate(new Date()) });
    this.fetchStudent();
    this.fetchSubjects();
    this.fetchPaperTypes();
    this.fetchPaperSchools();
    this.fetchPapers();
  },

  onShow() {
    if (this.studentId) this.fetchPapers();
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
          .map((entry) => ({
            id: entry?.subject?.id,
            name: entry?.subject?.name,
            displayName: formatSubjectName(entry?.subject?.name || ""),
          }))
          .filter((s) => s.id && s.name);
        const options = ["请选择科目", ...subjects.map((s) => s.displayName || s.name)];
        this.setData({ subjects, subjectOptions: options });
      })
      .catch(() => this.setData({ subjects: [], subjectOptions: ["请选择科目"] }));
  },

  fetchPaperTypes() {
    request({ url: "/paper-types" })
      .then((data) => {
        const types = data || [];
        const options = ["请选择类型", ...types.map((t) => t.name)];
        this.setData({ paperTypes: types, paperTypeOptions: options });
      })
      .catch(() => this.setData({ paperTypes: [], paperTypeOptions: ["请选择类型"] }));
  },

  fetchPaperSchools() {
    request({ url: "/paper-schools" })
      .then((data) => {
        const schools = data || [];
        const options = ["请选择学校", ...schools.map((s) => s.name)];
        this.setData({ paperSchools: schools, paperSchoolOptions: options });
      })
      .catch(() => this.setData({ paperSchools: [], paperSchoolOptions: ["请选择学校"] }));
  },

  fetchPapers() {
    this.setData({ loading: true });
    request({ url: `/students/${this.studentId}/papers` })
      .then((data) => {
        const papers = (data || []).map((item) => ({
          ...item,
          ...derivePaperScoreMeta(item),
        }));
        this.setData({ papers, grouped: buildGroups(papers) });
      })
      .catch(() => wx.showToast({ title: "获取试卷失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onSubjectPick(e) {
    this.setData({ subjectIndex: Number(e.detail.value) });
  },

  onTypePick(e) {
    this.setData({ typeIndex: Number(e.detail.value) });
  },

  onSchoolPick(e) {
    this.setData({ schoolIndex: Number(e.detail.value) });
  },

  onDateChange(e) {
    this.setData({ date: e.detail.value });
  },

  onScoreInput(e) {
    this.setData({ score: e.detail.value });
  },

  onTotalInput(e) {
    this.setData({ total: e.detail.value });
  },

  onDescriptionInput(e) {
    this.setData({ description: e.detail.value });
  },

  onStrengthsInput(e) {
    this.setData({ strengths: e.detail.value });
  },

  onImprovementsInput(e) {
    this.setData({ improvements: e.detail.value });
  },

  addPaperType() {
    if (!this.data.isTeacher) return;
    wx.showModal({
      title: "新增试卷类型",
      editable: true,
      placeholderText: "例如：模拟考",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-types", method: "POST", data: { name } })
          .then(() => this.fetchPaperTypes())
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.message || "添加失败", icon: "error" });
          });
      },
    });
  },

  addPaperSchool() {
    if (!this.data.isTeacher) return;
    wx.showModal({
      title: "新增学校",
      editable: true,
      placeholderText: "例如：南山中学",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-schools", method: "POST", data: { name } })
          .then(() => this.fetchPaperSchools())
          .catch((err) => {
            if (showActionLockToast(err)) return;
            wx.showToast({ title: err?.message || "添加失败", icon: "error" });
          });
      },
    });
  },

  startEdit(e) {
    const id = e.currentTarget.dataset.id;
    const paper = (this.data.papers || []).find((p) => p.id === id);
    if (!paper) return;
    const subjectIndex = Math.max(0, this.data.subjects.findIndex((s) => s.id === paper.subjectId) + 1);
    const typeIndex = Math.max(0, this.data.paperTypes.findIndex((t) => t.id === paper.typeId) + 1);
    const schoolIndex = Math.max(0, this.data.paperSchools.findIndex((s) => s.id === paper.schoolId) + 1);
    this.setData({
      editingId: paper.id,
      subjectIndex,
      typeIndex,
      schoolIndex,
      date: paper.date,
      score: paper.score ?? "",
      total: paper.total ?? "",
      description: paper.description || "",
      strengths: paper.strengths || "",
      improvements: paper.improvements || "",
      editingUpdatedAt: paper.updatedAt || "",
      editingUpdatedBy: paper.updatedByName || "",
      editingUpdatedAtText: paper.updatedAt ? formatChinaDateTime(new Date(paper.updatedAt)) : "",
    });
  },

  cancelEdit() {
    this.setData({
      editingId: "",
      subjectIndex: 0,
      typeIndex: 0,
      schoolIndex: 0,
      date: formatChinaDate(new Date()),
      score: "",
      total: "",
      description: "",
      strengths: "",
      improvements: "",
      editingUpdatedAt: "",
      editingUpdatedBy: "",
      editingUpdatedAtText: "",
    });
  },

  savePaper() {
    if (!this.data.isTeacher) return;
    const subject = this.data.subjects[this.data.subjectIndex - 1];
    const type = this.data.paperTypes[this.data.typeIndex - 1];
    const school = this.data.paperSchools[this.data.schoolIndex - 1];
    if (!subject) {
      wx.showToast({ title: "请选择科目", icon: "none" });
      return;
    }
    if (!type || !school || !this.data.date) {
      wx.showToast({ title: "请选择类型/学校/日期", icon: "none" });
      return;
    }
    if (!isYmd(this.data.date)) {
      wx.showToast({ title: "日期格式无效", icon: "none" });
      return;
    }
    if (!String(this.data.strengths || "").trim()) {
      wx.showToast({ title: "请填写做得好的地方", icon: "none" });
      return;
    }
    if (!String(this.data.improvements || "").trim()) {
      wx.showToast({ title: "请填写需要改进的地方", icon: "none" });
      return;
    }
    if (trimText(this.data.description).length > LIMITS.shortTextMax) {
      wx.showToast({ title: "描述过长", icon: "none" });
      return;
    }
    if (trimText(this.data.strengths).length > LIMITS.commentMax) {
      wx.showToast({ title: "优点评价过长", icon: "none" });
      return;
    }
    if (trimText(this.data.improvements).length > LIMITS.commentMax) {
      wx.showToast({ title: "改进建议过长", icon: "none" });
      return;
    }
    const scoreText = trimText(this.data.score);
    const totalText = trimText(this.data.total);
    const scoreNum = scoreText ? Number(scoreText) : null;
    const totalNum = totalText ? Number(totalText) : null;
    if (scoreNum != null && (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > LIMITS.scoreMax)) {
      wx.showToast({ title: "得分超出合理范围", icon: "none" });
      return;
    }
    if (totalNum != null && (!Number.isFinite(totalNum) || totalNum <= 0 || totalNum > LIMITS.scoreMax)) {
      wx.showToast({ title: "总分超出合理范围", icon: "none" });
      return;
    }
    if (scoreNum != null && totalNum != null && scoreNum > totalNum) {
      wx.showToast({ title: "得分不能超过总分", icon: "none" });
      return;
    }
    const payload = {
      subjectId: subject ? subject.id : "",
      subjectName: subject ? subject.name : "",
      typeId: type.id,
      schoolId: school.id,
      description: this.data.description || "",
      strengths: this.data.strengths || "",
      improvements: this.data.improvements || "",
      date: this.data.date,
      score: this.data.score,
      total: this.data.total,
    };
    const requestConfig = this.data.editingId
      ? {
          url: `/students/${this.studentId}/papers/${this.data.editingId}`,
          method: "PUT",
          data: { ...payload, updatedAt: this.data.editingUpdatedAt },
        }
      : { url: `/students/${this.studentId}/papers`, method: "POST", data: payload };

    request(requestConfig)
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.cancelEdit();
        this.fetchPapers();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        if (showConflictModal(err, () => this.fetchPapers())) return;
        if (err?.error === "PAPER_EVALUATION_REQUIRED") {
          wx.showToast({ title: "请填写两项试卷评价", icon: "none" });
          return;
        }
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },

  deletePaper(e) {
    if (!this.data.isTeacher) return;
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    wx.showModal({
      title: "确认删除",
      content: "删除后将进入该学生的回收站，可在 30 天内恢复。",
      success: (res) => {
        if (!res.confirm) return;
        const paper = (this.data.papers || []).find((p) => p.id === id);
        const updatedAt = encodeURIComponent(paper?.updatedAt || "");
        request({ url: `/students/${this.studentId}/papers/${id}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            this.fetchPapers();
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            if (showConflictModal(err, () => this.fetchPapers())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },
});
