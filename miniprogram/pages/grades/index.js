const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
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

const deriveScoreMeta = (rawScore, rawPercentage, rawGrade) => {
  const scoreText = String(rawScore || "").trim();
  const slash = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(scoreText);
  const score = slash ? toNumOrNull(slash[1]) : toNumOrNull(scoreText);
  const total = slash ? toNumOrNull(slash[2]) : null;
  const percentage = Number.isFinite(Number(rawPercentage))
    ? Number(rawPercentage)
    : (score != null && total != null && total > 0
      ? Math.round((score / total) * 10000) / 100
      : (score != null && score >= 0 && score <= 100 ? score : null));
  const grade = (String(rawGrade || "").trim()) || percentageToGrade(percentage);
  return {
    percentageDisplay: percentage == null ? "" : String(percentage),
    gradeDisplay: grade || "",
  };
};

const canonicalSubjectKey = (name = "") => {
  const raw = String(name || "").trim();
  const lower = raw.toLowerCase();
  if (
    lower === "english" ||
    lower.includes(" english") ||
    lower.includes("英文") ||
    lower.includes("英语")
  ) {
    return "__english__";
  }
  return lower;
};

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
        const subjectNames = (data || [])
          .map((entry) => entry?.subject?.name)
          .filter(Boolean);
        const unique = [];
        const seenKeys = new Set();
        subjectNames.forEach((name) => {
          const key = canonicalSubjectKey(name);
          if (!seenKeys.has(key)) {
            seenKeys.add(key);
            unique.push(name);
          }
        });
        const hasEnglish = unique.some((name) => canonicalSubjectKey(name) === "__english__");
        const baseSubjects = hasEnglish ? unique : ["英文", ...unique];
        this.setData({
          baseSubjects,
          examSubjects: baseSubjects.map((name) => ({
            name,
            displayName: formatSubjectName(name),
            score: "",
            examDate: "",
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
            examDate: "",
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
            ...deriveScoreMeta(s.score, s.percentage, s.grade),
          })),
        }));
        this.setData({ exams });
        const user = wx.getStorageSync("user");
        if (user?.role === "parent" && exams.length) {
          const latest = exams[0]?.updatedAt || exams[0]?.examDate || exams[0]?.createdAt || "";
          if (latest) {
            wx.setStorageSync(`grades_seen_${this.studentId}`, latest);
          }
        }
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
    const map = new Map(
      (exam?.subjects || []).map((s) => [canonicalSubjectKey(s.name), s]),
    );
    const trimDate = (v) => (typeof v === "string" ? v.slice(0, 10) : "");
    const list = baseSubjects.map((name) => {
      const s = map.get(canonicalSubjectKey(name));
      return {
        name,
        displayName: formatSubjectName(name),
        score: s?.score || "",
        examDate: trimDate(s?.examDate || ""),
        isCustom: false,
      };
    });
    (exam?.subjects || []).forEach((s) => {
      const key = canonicalSubjectKey(s.name);
      const existsInBase = baseSubjects.some((name) => canonicalSubjectKey(name) === key);
      if (!existsInBase) {
        list.push({
          name: s.name,
          displayName: formatSubjectName(s.name),
          score: s.score || "",
          examDate: trimDate(s.examDate || ""),
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
        examDate: "",
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
    const key = canonicalSubjectKey(name);
    const exists = this.data.examSubjects.some((s) => canonicalSubjectKey(s.name) === key);
    if (exists) {
      wx.showToast({ title: "科目已存在", icon: "none" });
      return;
    }
    if (name.length > 50) {
      wx.showToast({ title: "科目名称过长", icon: "none" });
      return;
    }
    if ((this.data.examSubjects || []).length >= LIMITS.examSubjectsMax) {
      wx.showToast({ title: "科目数量过多", icon: "none" });
      return;
    }
    const examSubjects = [
      ...this.data.examSubjects,
      { name, displayName: formatSubjectName(name), score: "", examDate: "", isCustom: true },
    ];
    this.setData({ examSubjects, customSubjectName: "" });
  },

  onSubjectDateChange(e) {
    const index = e.currentTarget.dataset.index;
    const value = e.detail.value;
    const examSubjects = [...this.data.examSubjects];
    if (!examSubjects[index]) return;
    examSubjects[index].examDate = value;
    this.setData({ examSubjects });
  },

  clearSubjectDate(e) {
    const index = e.currentTarget.dataset.index;
    const examSubjects = [...this.data.examSubjects];
    if (!examSubjects[index]) return;
    examSubjects[index].examDate = "";
    this.setData({ examSubjects });
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
    if (!name) {
      wx.showToast({ title: "请填写考试名称", icon: "none" });
      return;
    }
    if (name.length > 50) {
      wx.showToast({ title: "考试名称过长", icon: "none" });
      return;
    }
    // Only subjects with a date (or a score, for retroactive entry) are part
    // of the exam. Others are silently dropped.
    const subjects = (this.data.examSubjects || [])
      .map((s) => ({
        name: s.name,
        score: (s.score || "").trim(),
        examDate: (s.examDate || "").trim() || null,
      }))
      .filter((s) => s.examDate || s.score);
    if (subjects.length > LIMITS.examSubjectsMax) {
      wx.showToast({ title: "科目数量过多", icon: "none" });
      return;
    }
    for (const subject of subjects) {
      if (subject.examDate && !isYmd(subject.examDate)) {
        wx.showToast({ title: `科目 ${subject.name} 日期无效`, icon: "none" });
        return;
      }
      const scoreText = trimText(subject.score);
      if (!scoreText) continue;
      const slashMatch = /^(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(scoreText);
      if (slashMatch) {
        const scoreNum = Number(slashMatch[1]);
        const totalNum = Number(slashMatch[2]);
        if (
          !Number.isFinite(scoreNum) ||
          !Number.isFinite(totalNum) ||
          scoreNum < 0 ||
          totalNum <= 0 ||
          totalNum > LIMITS.scoreMax ||
          scoreNum > totalNum
        ) {
          wx.showToast({ title: `科目 ${subject.name} 分数格式异常`, icon: "none" });
          return;
        }
        continue;
      }
      const scoreNum = Number(scoreText);
      if (!Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > LIMITS.scoreMax) {
        wx.showToast({ title: `科目 ${subject.name} 分数超范围`, icon: "none" });
        return;
      }
    }
    if (!subjects.length) {
      wx.showToast({ title: "请至少为一个科目设置考试日期", icon: "none" });
      return;
    }
    // Parent exam.exam_date = earliest subject date (column is NOT NULL).
    const dates = subjects.map((s) => s.examDate).filter(Boolean).sort();
    const examDate = dates[0] || this.data.examDate || "";
    if (!examDate) {
      wx.showToast({ title: "请至少为一个科目设置考试日期", icon: "none" });
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
            examDate: "",
            isCustom: false,
          })),
          editingUpdatedAt: "",
          editingUpdatedBy: "",
          editingUpdatedAtText: "",
        });
        wx.showToast({ title: isEditing ? "已保存" : "已添加", icon: "success" });
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        if (showConflictModal(err, () => this.fetchExams())) return;
        wx.showToast({ title: err?.message || (isEditing ? "保存失败" : "添加失败"), icon: "error" });
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
      content: "删除后将进入该学生的回收站，可在 30 天内恢复。",
      success: (res) => {
        if (!res.confirm) return;
        request({ url: `/exams/${id}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            const exams = this.data.exams.filter((g) => g.id !== id);
            this.setData({ exams });
            wx.showToast({ title: "已删除", icon: "success" });
          })
          .catch((err) => {
            if (showActionLockToast(err)) return;
            if (showConflictModal(err, () => this.fetchExams())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },
});
