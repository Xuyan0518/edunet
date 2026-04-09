const { request } = require("../../utils/api");
const { formatSubjectName } = require("../../utils/displayName");
const { formatChinaDate, formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");

const attendanceMap = [
  { value: "present", label: "出席" },
  { value: "late", label: "迟到" },
  { value: "absent", label: "缺席" },
];

const buildEnglishFields = (input = {}) => ({
  editing: input.editing || "",
  vocab: input.vocab || input.vocabulary || "",
  reading: input.reading || "",
  recitation: input.recitation || input.memory || "",
  essay: input.essay || "",
});

const isEnglishSubject = (subject = {}) => {
  const name = String(subject.name || subject.subjectName || subject.subject || "").toLowerCase();
  const code = String(subject.code || subject.subjectCode || "").toLowerCase();
  return (
    name.includes("english") ||
    name.includes("英文") ||
    name.includes("英语") ||
    code.includes("eng")
  );
};

const buildEnglishActivity = (input = {}) => ({
  subjectId: input.subjectId || "",
  subjectName: input.subjectName || "英文",
  subjectDisplayName: formatSubjectName(input.subjectName || "英文"),
  type: "english",
  english: buildEnglishFields(input),
  comment: input.comment || "",
  papers: input.papers || [],
  locked: true,
});

const normalizeActivity = (activity = {}) => {
  const subjectName = activity.subjectName || activity.subject || "";
  const subjectId = activity.subjectId || "";
  const english = activity.english || activity.englishFields || {};
  const isEnglish =
    activity.type === "english" ||
    Object.keys(english).length > 0 ||
    String(subjectName || "").toLowerCase() === "english" ||
    String(subjectName || "").includes("英文") ||
    String(subjectName || "").includes("英语");
  if (isEnglish) {
    return {
      subjectId,
      subjectName: subjectName || "英文",
      subjectDisplayName: formatSubjectName(subjectName || "英文"),
      type: "english",
      english: buildEnglishFields({ ...english, ...activity }),
      comment: activity.comment || "",
      papers: activity.papers || [],
      locked: true,
    };
  }
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    practiceProgress: activity.practiceProgress || activity.description || "",
    definitionRecitation: activity.definitionRecitation || activity.notes || "",
    comment: activity.comment || "",
    papers: activity.papers || [],
  };
};

const buildPaperEntry = (input = {}) => ({
  id: input.id || "",
  typeId: input.typeId || "",
  schoolId: input.schoolId || "",
  description: input.description || "",
  score: input.score ?? "",
  total: input.total ?? "",
  typeIndex: input.typeIndex ?? 0,
  schoolIndex: input.schoolIndex ?? 0,
});

const ensureEnglishActivity = (activities = []) => {
  const idx = activities.findIndex((a) => a.type === "english");
  if (idx >= 0) {
    const next = [...activities];
    next[idx] = { ...buildEnglishActivity(next[idx]?.english || {}), ...next[idx], locked: true };
    return next;
  }
  return [buildEnglishActivity(), ...activities];
};

const buildActivityForSubject = (subject) => {
  const subjectName = subject?.name || subject?.subjectName || "";
  const subjectId = subject?.id || "";
  return {
    subjectId,
    subjectName,
    subjectDisplayName: formatSubjectName(subjectName),
    type: "generic",
    practiceProgress: "",
    definitionRecitation: "",
    comment: "",
    papers: [],
  };
};

Page({
  data: {
    student: {},
    selectedDate: "",
    attendance: "present",
    attendanceLabel: "出席",
    attendanceOptions: attendanceMap.map((a) => a.label),
    attendanceStart: "18:00",
    attendanceEnd: "21:00",
    summary: "",
    subjects: [],
    subjectOptions: [],
    activities: [buildEnglishActivity()],
    paperTypes: [],
    paperTypeOptions: ["请选择类型"],
    paperSchools: [],
    paperSchoolOptions: ["请选择学校"],
    existingId: null,
    editingId: null,
    isTeacher: false,
    isEditing: false,
    isEditable: false,
    backup: null,
    lastUpdatedAt: "",
    lastUpdatedBy: "",
    lastUpdatedAtText: "",
    papersUpdatedAt: "",
    papersUpdatedBy: "",
    papersUpdatedAtText: "",
  },

  onLoad(query) {
    const user = wx.getStorageSync("user");
    const isTeacher = user?.role === "teacher";
    if (user?.role === "parent") {
      wx.showToast({ title: "家长仅查看每周汇报", icon: "none" });
      wx.navigateBack();
      return;
    }
    this.studentId = query.studentId;
    const date = query.date || this.today();

    if (!this.studentId) {
      wx.showToast({ title: "缺少学生信息", icon: "error" });
      wx.navigateBack();
      return;
    }

    this.setData({
      isTeacher,
      selectedDate: date,
      isEditing: !query.date && isTeacher,
      isEditable: !query.date && isTeacher,
    });

    this.fetchStudent();
    this.fetchSubjects();
    this.fetchPaperTypes();
    this.fetchPaperSchools();
    this.fetchProgress();
  },

  today() {
    return formatChinaDate(new Date());
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
            code: entry?.subject?.code,
          }))
          .filter((s) => s.id && s.name);
        const unique = [];
        const seen = new Set();
        subjects.forEach((s) => {
          if (!seen.has(s.id)) {
            seen.add(s.id);
            unique.push(s);
          }
        });
        this.setData({
          subjects: unique,
          subjectOptions: unique.map((s) => formatSubjectName(s.name)),
        }, () => {
          this.ensureEnglishSubject(unique);
        });
      })
      .catch(() => {
        this.setData({ subjects: [], subjectOptions: [] });
      });
  },

  fetchPaperTypes() {
    request({ url: "/paper-types" })
      .then((data) => {
        const types = data || [];
        const options = ["请选择类型", ...types.map((t) => t.name)];
        this.setData({ paperTypes: types, paperTypeOptions: options }, () => this.syncPaperPickers());
      })
      .catch(() => this.setData({ paperTypes: [], paperTypeOptions: ["请选择类型"] }));
  },

  fetchPaperSchools() {
    request({ url: "/paper-schools" })
      .then((data) => {
        const schools = data || [];
        const options = ["请选择学校", ...schools.map((s) => s.name)];
        this.setData({ paperSchools: schools, paperSchoolOptions: options }, () => this.syncPaperPickers());
      })
      .catch(() => this.setData({ paperSchools: [], paperSchoolOptions: ["请选择学校"] }));
  },

  fetchProgress() {
    wx.request({
      url: `${getApp().globalData.apiBaseUrl}/progress/student?studentId=${this.studentId}&date=${this.data.selectedDate}`,
      header: {
        Authorization: `Bearer ${wx.getStorageSync("token")}`,
      },
      success: (res) => {
        if (res.statusCode === 404) {
          if (this.data.isTeacher) {
            this.setData({
              isEditing: true,
              isEditable: true,
              existingId: null,
              backup: null,
              editingId: null,
              attendance: "present",
              attendanceLabel: "出席",
              attendanceStart: "18:00",
              attendanceEnd: "21:00",
              summary: "",
              activities: [buildEnglishActivity()],
              lastUpdatedAt: "",
              lastUpdatedBy: "",
              lastUpdatedAtText: "",
            });
          }
          this.fetchPapersForDate();
          return;
        }
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const entry = res.data;
          const attendanceLabel = attendanceMap.find((a) => a.value === entry.attendance)?.label || "出席";
          const activities = ensureEnglishActivity((entry.activities || []).map((a) => normalizeActivity(a)));
          const updatedAtText = entry.updatedAt
            ? formatChinaDateTime(new Date(entry.updatedAt))
            : "";
          this.setData({
            existingId: entry.id,
            editingId: null,
            attendance: entry.attendance,
            attendanceLabel,
            attendanceStart: entry.attendanceStart || "18:00",
            attendanceEnd: entry.attendanceEnd || "21:00",
            summary: entry.summary || "",
            activities: activities.length ? activities : [buildEnglishActivity()],
            isEditing: false,
            isEditable: false,
            backup: null,
            lastUpdatedAt: entry.updatedAt || "",
            lastUpdatedBy: entry.updatedByName || "",
            lastUpdatedAtText: updatedAtText,
          });
          this.fetchPapersForDate();
        } else {
          wx.showToast({ title: "获取记录失败", icon: "error" });
        }
      },
      fail: () => wx.showToast({ title: "获取记录失败", icon: "error" }),
    });
  },

  onDateChange(e) {
    if (!this.data.isEditable) return;
    const nextDate = e.detail.value;
    // Changing date should load existing record if available; otherwise start a new blank record.
    this.setData({
      selectedDate: nextDate,
      existingId: null,
      editingId: null,
      isEditing: false,
      isEditable: false,
      backup: null,
      attendance: "present",
      attendanceLabel: "出席",
      attendanceStart: "18:00",
      attendanceEnd: "21:00",
      activities: [buildEnglishActivity()],
      lastUpdatedAt: "",
      lastUpdatedBy: "",
      lastUpdatedAtText: "",
      papersUpdatedAt: "",
      papersUpdatedBy: "",
      papersUpdatedAtText: "",
    });
    this.fetchProgress();
  },

  fetchPapersForDate() {
    if (!this.studentId || !this.data.selectedDate) return;
    request({ url: `/students/${this.studentId}/papers?date=${this.data.selectedDate}` })
      .then((data) => this.applyPapersToActivities(data || []))
      .catch(() => this.applyPapersToActivities([]));
  },

  bindEnglishSubject(english) {
    if (!english?.id) return;
    const activities = (this.data.activities || []).map((a) => {
      if (a.type === "english") {
        return {
          ...a,
          subjectId: english.id,
          subjectName: english.name || a.subjectName,
          subjectDisplayName: formatSubjectName(english.name || a.subjectName),
        };
      }
      return a;
    });
    this.setData({ activities });
  },

  ensureEnglishSubject(subjects = []) {
    const english = subjects.find((s) => isEnglishSubject(s));
    if (english) {
      this.bindEnglishSubject(english);
      return;
    }

    if (!this.data.isTeacher || this.englishAssigning) return;
    this.englishAssigning = true;

    request({ url: "/subjects" })
      .then((all) => {
        const englishGlobal = (all || []).find((s) => isEnglishSubject(s));
        if (!englishGlobal) {
          wx.showToast({ title: "未找到英文科目，请在后台添加", icon: "none" });
          return null;
        }
        const currentIds = (subjects || []).map((s) => s.id).filter(Boolean);
        if (currentIds.includes(englishGlobal.id)) {
          this.bindEnglishSubject(englishGlobal);
          return null;
        }
        return request({
          url: `/students/${this.studentId}/subjects`,
          method: "PUT",
          data: {
            subjectIds: [...currentIds, englishGlobal.id],
            resetProgress: "keep",
          },
        }).then(() => englishGlobal);
      })
      .then((englishGlobal) => {
        if (!englishGlobal) return;
        const nextSubjects = [
          ...subjects,
          { id: englishGlobal.id, name: englishGlobal.name, code: englishGlobal.code },
        ];
        this.setData({
          subjects: nextSubjects,
          subjectOptions: nextSubjects.map((s) => formatSubjectName(s.name)),
        });
        this.bindEnglishSubject(englishGlobal);
      })
      .catch(() => {
        wx.showToast({ title: "同步英文科目失败", icon: "none" });
      })
      .finally(() => {
        this.englishAssigning = false;
      });
  },

  applyPapersToActivities(papers) {
    const grouped = {};
    (papers || []).forEach((p) => {
      const key = p.subjectId || p.subjectName || "";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(buildPaperEntry(p));
    });
    let latestAt = "";
    let latestBy = "";
    (papers || []).forEach((p) => {
      if (!p.updatedAt) return;
      if (!latestAt || new Date(p.updatedAt).getTime() > new Date(latestAt).getTime()) {
        latestAt = p.updatedAt;
        latestBy = p.updatedByName || "";
      }
    });
    const latestText = latestAt ? formatChinaDateTime(new Date(latestAt)) : "";
    const activities = (this.data.activities || []).map((a) => {
      const key = a.subjectId || a.subjectName || "";
      return { ...a, papers: (grouped[key] || []).map((p) => buildPaperEntry(p)) };
    });
    this.setData(
      {
        activities,
        papersUpdatedAt: latestAt || "",
        papersUpdatedBy: latestBy || "",
        papersUpdatedAtText: latestText,
      },
      () => this.syncPaperPickers()
    );
  },

  onAttendanceChange(e) {
    const index = e.detail.value;
    const option = attendanceMap[index];
    if (!option) return;
    this.setData({ attendance: option.value, attendanceLabel: option.label });
  },

  onAttendanceStartChange(e) {
    if (!this.data.isEditable) return;
    this.setData({ attendanceStart: e.detail.value });
  },

  onAttendanceEndChange(e) {
    if (!this.data.isEditable) return;
    this.setData({ attendanceEnd: e.detail.value });
  },

  onTimeInputChange(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onTimeInputBlur(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    const value = (e.detail.value || "").trim();
    if (!field) return;
    if (!value) {
      this.setData({ [field]: "" });
      return;
    }
    const isValid = /^([01]\\d|2[0-3]):([0-5]\\d)$/.test(value);
    if (!isValid) {
      wx.showToast({ title: "请输入有效时间 HH:mm", icon: "none" });
      return;
    }
    this.setData({ [field]: value });
  },

  onFieldInput(e) {
    if (!this.data.isEditable) return;
    const field = e.currentTarget.dataset.field;
    if (!field) return;
    this.setData({ [field]: e.detail.value });
  },

  onActivityChange(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const field = e.currentTarget.dataset.field;
    const subfield = e.currentTarget.dataset.subfield;
    const activities = [...this.data.activities];
    if (subfield) {
      activities[index][field] = {
        ...(activities[index][field] || {}),
        [subfield]: e.detail.value,
      };
    } else {
      activities[index][field] = e.detail.value;
    }
    this.setData({ activities });
  },

  syncPaperPickers() {
    const { paperTypes, paperSchools } = this.data;
    const activities = (this.data.activities || []).map((a) => {
      const papers = (a.papers || []).map((p) => {
        const typeIndex = p.typeId ? paperTypes.findIndex((t) => t.id === p.typeId) + 1 : 0;
        const schoolIndex = p.schoolId ? paperSchools.findIndex((s) => s.id === p.schoolId) + 1 : 0;
        return { ...p, typeIndex: Math.max(typeIndex, 0), schoolIndex: Math.max(schoolIndex, 0) };
      });
      return { ...a, papers };
    });
    this.setData({ activities });
  },

  addPaperType(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    wx.showModal({
      title: "新增试卷类型",
      editable: true,
      placeholderText: "例如：模拟考",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-types", method: "POST", data: { name } })
          .then((created) => {
            this.fetchPaperTypes();
            if (created?.id) {
              const activities = [...this.data.activities];
              const papers = activities[index].papers || [];
              if (papers[paperIndex]) {
                papers[paperIndex].typeId = created.id;
              }
              activities[index].papers = papers;
              this.setData({ activities }, () => this.syncPaperPickers());
            }
          })
          .catch(() => wx.showToast({ title: "添加失败", icon: "error" }));
      },
    });
  },

  addPaperSchool(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    wx.showModal({
      title: "新增学校",
      editable: true,
      placeholderText: "例如：南山中学",
      success: (res) => {
        if (!res.confirm) return;
        const name = (res.content || "").trim();
        if (!name) return;
        request({ url: "/paper-schools", method: "POST", data: { name } })
          .then((created) => {
            this.fetchPaperSchools();
            if (created?.id) {
              const activities = [...this.data.activities];
              const papers = activities[index].papers || [];
              if (papers[paperIndex]) {
                papers[paperIndex].schoolId = created.id;
              }
              activities[index].papers = papers;
              this.setData({ activities }, () => this.syncPaperPickers());
            }
          })
          .catch(() => wx.showToast({ title: "添加失败", icon: "error" }));
      },
    });
  },

  addPaper(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    papers.push(buildPaperEntry());
    activities[index].papers = papers;
    this.setData({ activities });
  },

  removePaper(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    activities[index].papers = papers.filter((_, i) => i !== paperIndex);
    this.setData({ activities });
  },

  onPaperChange(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const field = e.currentTarget.dataset.field;
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target[field] = e.detail.value;
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onPaperTypePick(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const typeIndex = Number(e.detail.value);
    const type = this.data.paperTypes[typeIndex - 1];
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target.typeIndex = typeIndex;
    target.typeId = type ? type.id : "";
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onPaperSchoolPick(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const paperIndex = e.currentTarget.dataset.paper;
    const schoolIndex = Number(e.detail.value);
    const school = this.data.paperSchools[schoolIndex - 1];
    const activities = [...this.data.activities];
    const papers = activities[index].papers || [];
    const target = papers[paperIndex] || buildPaperEntry();
    target.schoolIndex = schoolIndex;
    target.schoolId = school ? school.id : "";
    papers[paperIndex] = target;
    activities[index].papers = papers;
    this.setData({ activities });
  },

  onSubjectPick(e) {
    if (!this.data.isEditable) return;
    const index = Number(e.detail.value);
    const subject = this.data.subjects[index];
    if (!subject) return;
    const exists = this.data.activities.some((a) => a.subjectId === subject.id);
    if (exists) {
      wx.showToast({ title: "该科目已添加", icon: "none" });
      return;
    }
    const activities = [...this.data.activities, buildActivityForSubject(subject)];
    this.setData({ activities: ensureEnglishActivity(activities) });
  },

  removeActivity(e) {
    if (!this.data.isEditable) return;
    const index = e.currentTarget.dataset.index;
    const activities = this.data.activities.filter((_, i) => i !== index);
    this.setData({ activities: ensureEnglishActivity(activities) });
  },

  startEdit() {
    this.setData({
      isEditing: true,
      isEditable: true,
      editingId: this.data.existingId,
      backup: {
        selectedDate: this.data.selectedDate,
        attendance: this.data.attendance,
        attendanceLabel: this.data.attendanceLabel,
        attendanceStart: this.data.attendanceStart,
        attendanceEnd: this.data.attendanceEnd,
        summary: this.data.summary,
        activities: JSON.parse(JSON.stringify(this.data.activities)),
        existingId: this.data.existingId,
      },
    });
  },

  cancelEdit() {
    if (!this.data.existingId && !this.data.backup) {
      wx.navigateBack();
      return;
    }
    const backup = this.data.backup;
    if (!backup) {
      this.setData({ isEditing: false, isEditable: false });
      return;
    }
    this.setData({
      selectedDate: backup.selectedDate,
      attendance: backup.attendance,
      attendanceLabel: backup.attendanceLabel,
      attendanceStart: backup.attendanceStart || "",
      attendanceEnd: backup.attendanceEnd || "",
      summary: backup.summary || "",
      activities: backup.activities,
      existingId: backup.existingId,
      editingId: null,
      isEditing: false,
      isEditable: false,
      backup: null,
    });
    this.fetchProgress();
  },

  deleteEntry() {
    if (!this.data.existingId) return;
    wx.showModal({
      title: "确认删除",
      content: "删除后无法恢复，确定继续？",
      success: (res) => {
        if (!res.confirm) return;
        const updatedAt = encodeURIComponent(this.data.lastUpdatedAt || "");
        request({ url: `/progress/${this.data.existingId}?updatedAt=${updatedAt}`, method: "DELETE" })
          .then(() => {
            wx.showToast({ title: "已删除", icon: "success" });
            wx.navigateBack();
          })
          .catch((err) => {
            if (showConflictModal(err, () => this.fetchProgress())) return;
            wx.showToast({ title: "删除失败", icon: "error" });
          });
      },
    });
  },

  save() {
    if (!this.data.isEditable) return;
    if (!this.data.selectedDate) {
      wx.showToast({ title: "请选择日期", icon: "none" });
      return;
    }

    if (!this.data.attendanceStart || !this.data.attendanceEnd) {
      wx.showToast({ title: "请填写出勤时间", icon: "none" });
      return;
    }

    if (!this.data.activities.length) {
      wx.showToast({ title: "请先添加科目活动", icon: "none" });
      return;
    }

    const cleaned = ensureEnglishActivity(this.data.activities).map((a) => {
      const type = a.type || (a.english ? "english" : "generic");
      const payload = {
        subjectId: a.subjectId || "",
        subjectName: a.subjectName || "",
        type,
        practiceProgress: a.practiceProgress || "",
        definitionRecitation: a.definitionRecitation || "",
        comment: a.comment || "",
      };
      if (type === "english") {
        payload.english = a.english || buildEnglishFields();
      }
      return payload;
    });

    const payload = {
      studentId: this.studentId,
      date: this.data.selectedDate,
      attendance: this.data.attendance,
      attendanceStart: this.data.attendanceStart,
      attendanceEnd: this.data.attendanceEnd,
      summary: this.data.summary || "",
      activities: cleaned,
    };

    const updateId = this.data.editingId || this.data.existingId;
    const requestConfig = updateId
      ? { url: `/progress/${updateId}`, method: "PUT", data: { ...payload, updatedAt: this.data.lastUpdatedAt } }
      : { url: "/progress", method: "POST", data: payload };

    request(requestConfig)
      .then((data) => {
        const paperPayloads = [];
        (this.data.activities || []).forEach((a) => {
          (a.papers || []).forEach((p) => {
            if (!p.typeId || !p.schoolId) return;
            paperPayloads.push({
              subjectId: a.subjectId || "",
              subjectName: a.subjectName || "",
              typeId: p.typeId,
              schoolId: p.schoolId,
              description: p.description || "",
              score: p.score,
              total: p.total,
            });
          });
        });
        return request({
          url: `/students/${this.studentId}/papers/batch`,
          method: "PUT",
          data: {
            date: this.data.selectedDate,
            papers: paperPayloads,
            expectedUpdatedAt: this.data.papersUpdatedAt || "",
          },
        }).then(() => data);
      })
      .then((data) => {
        wx.showToast({ title: "已保存", icon: "success" });
        const updatedAtText = data?.updatedAt
          ? formatChinaDateTime(new Date(data.updatedAt))
          : this.data.lastUpdatedAtText;
        this.setData({
          existingId: data.id || updateId,
          editingId: null,
          isEditing: false,
          isEditable: false,
          backup: null,
          lastUpdatedAt: data.updatedAt || this.data.lastUpdatedAt,
          lastUpdatedBy: data.updatedByName || this.data.lastUpdatedBy,
          lastUpdatedAtText: updatedAtText,
        });
        wx.navigateBack();
      })
      .catch((err) => {
        if (showConflictModal(err, () => this.fetchProgress())) return;
        if (err?.error?.includes?.("Progress already exists")) {
          wx.showToast({ title: "该日期已有记录", icon: "none" });
          return;
        }
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },
});
