const { request } = require("../../utils/api");
const { formatSubjectName, formatTopicTitle } = require("../../utils/displayName");
const { showActionLockToast } = require("../../utils/actionLock");

const statusLabel = {
  not_started: "未开始",
  in_progress: "进行中",
  completed: "已完成",
};

const statusClass = {
  not_started: "chip-muted",
  in_progress: "chip-warning",
  completed: "chip-success",
};

const attendanceLabels = {
  present: "出席",
  late: "迟到",
  absent: "缺席",
};

const deriveTopicStatus = (definitionRecited, chapterExerciseCompleted) => {
  if (definitionRecited && chapterExerciseCompleted) return "completed";
  if (definitionRecited || chapterExerciseCompleted) return "in_progress";
  return "not_started";
};

const decorateTopic = (topic) => {
  const definitionRecited = !!topic.definitionRecited;
  const chapterExerciseCompleted = !!topic.chapterExerciseCompleted;
  const status = deriveTopicStatus(definitionRecited, chapterExerciseCompleted);
  return {
    id: topic.id,
    code: topic.code || "",
    title: topic.title || "",
    displayTitle: formatTopicTitle(topic),
    definitionRecited,
    chapterExerciseCompleted,
    status,
    statusLabel: statusLabel[status] || status,
    statusClass: statusClass[status] || "chip-muted",
    children: (topic.children || []).map(decorateTopic),
  };
};

const countTopics = (topics) =>
  (topics || []).reduce((sum, t) => sum + 1 + countTopics(t.children || []), 0);

const collectTopicStatus = (topics = []) => {
  const bucket = { completed: 0, in_progress: 0, not_started: 0 };
  const walk = (nodes) => {
    (nodes || []).forEach((n) => {
      const status = n.status || "not_started";
      if (status === "completed" || status === "in_progress" || status === "not_started") {
        bucket[status] += 1;
      }
      if (n.children && n.children.length) walk(n.children);
    });
  };
  walk(topics);
  return bucket;
};

Page({
  data: {
    student: {},
    subjects: [],
    isTeacher: false,
    isParent: false,
    expandedSubjects: {},
    expandedTopics: {},
    parents: [],
    boundParents: [],
    canManageStudentsAndParents: false,
    parentNames: ["不指定"],
    selectedParentId: "",
    selectedParentName: "不指定",
    parentName: "",
    dailyUnread: false,
    weeklyUnread: false,
    gradesUnread: false,
    reportsUnread: false,
    weeklyLatestMarker: "",
    gradesLatestMarker: "",
    reportsLatestMarker: "",
    parentStudents: [],
  },

  onLoad(query) {
    this.studentId = query.id;
    const user = wx.getStorageSync("user");
    const isTeacher = user?.role === "teacher";
    const isParent = user?.role === "parent";
    const canManageStudentsAndParents = !!user?.canManageStudentsAndParents;
    this.setData({ isTeacher, isParent, canManageStudentsAndParents });
    if (isTeacher && canManageStudentsAndParents) this.fetchParents();
  },

  onShow() {
    if (!this.studentId) return;
    this.fetchAll();
  },

  onPullDownRefresh() {
    this.fetchAll().finally(() => wx.stopPullDownRefresh());
  },

  fetchAll() {
    if (!this.studentId) return Promise.resolve();
    const tasks = [this.fetchStudent(), this.fetchSubjects()];
    if (!this.data.isTeacher) {
      tasks.push(this.checkWeeklyUnread());
      tasks.push(this.checkGradesUnread());
      tasks.push(this.checkReportsUnread());
      tasks.push(this.fetchParentStudents());
    }
    return Promise.all(tasks);
  },

  fetchStudent() {
    return request({ url: `/students/${this.studentId}` })
      .then((data) => {
        const parentIds = Array.isArray(data.parentIds)
          ? data.parentIds
          : (data.parentId ? [data.parentId] : []);
        const boundParents = parentIds
          .map((id) => this.data.parents.find((p) => p.id === id))
          .filter(Boolean);
        this.setData({
          student: { ...data, parentIds },
          boundParents,
          parentName: boundParents.length ? boundParents.map((p) => p.name).join("、") : "",
          selectedParentId: "",
          selectedParentName: "不指定",
        }, () => this.updateParentPickerOptions());
      })
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchParents() {
    return request({ url: "/parents" })
      .then((data) => {
        const approved = (data || []).filter((p) => p.status === "approved");
        this.setData({
          parents: approved,
        }, () => {
          const parentIds = Array.isArray(this.data.student.parentIds)
            ? this.data.student.parentIds
            : (this.data.student.parentId ? [this.data.student.parentId] : []);
          const boundParents = parentIds
            .map((id) => approved.find((p) => p.id === id))
            .filter(Boolean);
          this.setData({
            boundParents,
            parentName: boundParents.length ? boundParents.map((p) => p.name).join("、") : this.data.parentName,
          }, () => this.updateParentPickerOptions());
        });
      })
      .catch(() => wx.showToast({ title: "获取家长失败", icon: "error" }));
  },

  updateParentPickerOptions() {
    const boundIds = new Set(this.data.boundParents.map((p) => p.id));
    const available = this.data.parents.filter((parent) => !boundIds.has(parent.id));
    this.availableParents = available;
    this.setData({
      parentNames: ["选择家长"].concat(available.map((parent) => parent.name)),
      selectedParentId: "",
      selectedParentName: "选择家长",
    });
  },

  fetchSubjects() {
    return request({ url: `/students/${this.studentId}/subjects/full` })
      .then((data) => {
        const subjects = (data || []).map((entry) => {
          const topics = (entry.topics || []).map(decorateTopic);
          const statusSummary = collectTopicStatus(topics);
          const subject = entry.subject
            ? { ...entry.subject, displayName: formatSubjectName(entry.subject.name) }
            : entry.subject;
          return {
            subjectId: subject?.id || "",
            subject,
            topics,
            mainCount: topics.length,
            totalCount: countTopics(topics),
            statusSummary,
          };
        });
        const expandedSubjects = { ...this.data.expandedSubjects };
        const expandedTopics = { ...this.data.expandedTopics };
        subjects.forEach((s, idx) => {
          if (expandedSubjects[s.subject.id] === undefined) {
            expandedSubjects[s.subject.id] = false;
          }
          (s.topics || []).forEach((t) => {
            if (expandedTopics[t.id] === undefined) expandedTopics[t.id] = false;
          });
        });
        this.setData({ subjects, expandedSubjects, expandedTopics });
      })
      .catch(() => wx.showToast({ title: "获取科目失败", icon: "error" }));
  },

  fetchParentStudents() {
    if (!this.data.isParent) return Promise.resolve();
    return request({ url: "/students" })
      .then((data) => {
        const list = Array.isArray(data) ? data : [];
        this.setData({ parentStudents: list });
      })
      .catch(() => {
        this.setData({ parentStudents: [] });
      });
  },

  checkDailyUnread() {
    return request({ url: `/students/${this.studentId}/progress` })
      .then((data) => {
        const entries = data || [];
        const latest = entries.length ? entries[0].date : "";
        const seenKey = `daily_seen_${this.studentId}`;
        const seen = wx.getStorageSync(seenKey) || "";
        const dailyUnread = latest && (!seen || latest > seen);
        this.setData({ dailyUnread: !!dailyUnread });
      })
      .catch(() => wx.showToast({ title: "获取进度失败", icon: "error" }));
  },

  checkWeeklyUnread() {
    return request({ url: `/feedback/list?studentId=${this.studentId}` })
      .then((data) => {
        const entries = data || [];
        const latest = entries.length ? entries[0].weekStarting : "";
        const seenKey = `weekly_seen_${this.studentId}`;
        const seen = wx.getStorageSync(seenKey) || "";
        const weeklyUnread = latest && (!seen || latest > seen);
        this.setData({
          weeklyUnread: !!weeklyUnread,
          weeklyLatestMarker: latest || "",
        });
      })
      .catch(() => wx.showToast({ title: "获取反馈失败", icon: "error" }));
  },

  checkGradesUnread() {
    return request({ url: `/students/${this.studentId}/exams` })
      .then((data) => {
        const entries = Array.isArray(data) ? data : [];
        const first = entries[0] || {};
        const latest = first.updatedAt || first.examDate || first.createdAt || "";
        const seenKey = `grades_seen_${this.studentId}`;
        const seen = wx.getStorageSync(seenKey) || "";
        const gradesUnread = latest && (!seen || latest > seen);
        this.setData({
          gradesUnread: !!gradesUnread,
          gradesLatestMarker: latest || "",
        });
      })
      .catch(() => wx.showToast({ title: "获取成绩失败", icon: "error" }));
  },

  checkReportsUnread() {
    return request({ url: `/students/${this.studentId}/reports` })
      .then((data) => {
        const entries = Array.isArray(data) ? data : [];
        const first = entries[0] || {};
        const latest = first.updatedAt || first.createdAt || first.endDate || "";
        const seenKey = `reports_seen_${this.studentId}`;
        const seen = wx.getStorageSync(seenKey) || "";
        const reportsUnread = latest && (!seen || latest > seen);
        this.setData({
          reportsUnread: !!reportsUnread,
          reportsLatestMarker: latest || "",
        });
      })
      .catch(() => wx.showToast({ title: "获取报告失败", icon: "error" }));
  },

  syncTopics() {
    request({ url: `/students/${this.studentId}/subjects/sync-catalog`, method: "POST" })
      .then(() => {
        wx.showToast({ title: "已同步", icon: "success" });
        return this.fetchSubjects();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || "同步失败", icon: "error" });
      });
  },

  updateTopicCondition(e) {
    const topicId = e.currentTarget.dataset.topic;
    const condition = e.currentTarget.dataset.condition;
    const currentValue = e.currentTarget.dataset.value;
    const isActive = currentValue === true || currentValue === "true";
    const payload = { [condition]: !isActive };
    request({
      url: `/students/${this.studentId}/topics/${topicId}/progress`,
      method: "PUT",
      data: payload,
    })
      .then(() => this.fetchSubjects())
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || "更新失败", icon: "error" });
      });
  },

  toggleSubject(e) {
    const id = e.currentTarget.dataset.id;
    const expandedSubjects = { ...this.data.expandedSubjects };
    expandedSubjects[id] = !expandedSubjects[id];
    this.setData({ expandedSubjects });
  },

  toggleTopic(e) {
    const id = e.currentTarget.dataset.id;
    const expandedTopics = { ...this.data.expandedTopics };
    expandedTopics[id] = !expandedTopics[id];
    this.setData({ expandedTopics });
  },

  createProgress() {
    wx.navigateTo({ url: `/pages/daily-progress/detail?studentId=${this.studentId}` });
  },

  createFeedback() {
    wx.navigateTo({ url: `/pages/weekly-feedback/detail?studentId=${this.studentId}` });
  },

  openProgressList() {
    wx.navigateTo({ url: `/pages/daily-progress/index?studentId=${this.studentId}` });
  },

  openFeedbackList() {
    if (this.data.isParent && this.data.weeklyLatestMarker) {
      wx.setStorageSync(`weekly_seen_${this.studentId}`, this.data.weeklyLatestMarker);
      this.setData({ weeklyUnread: false });
    }
    wx.navigateTo({ url: `/pages/weekly-feedback/index?studentId=${this.studentId}` });
  },

  openGrades() {
    if (this.data.isParent && this.data.gradesLatestMarker) {
      wx.setStorageSync(`grades_seen_${this.studentId}`, this.data.gradesLatestMarker);
      this.setData({ gradesUnread: false });
    }
    wx.navigateTo({ url: `/pages/grades/index?studentId=${this.studentId}` });
  },

  openPapers() {
    wx.navigateTo({ url: `/pages/papers/index?studentId=${this.studentId}` });
  },

  openReports() {
    if (this.data.isParent && this.data.reportsLatestMarker) {
      wx.setStorageSync(`reports_seen_${this.studentId}`, this.data.reportsLatestMarker);
      this.setData({ reportsUnread: false });
    }
    wx.navigateTo({ url: `/pages/reports/index?studentId=${this.studentId}` });
  },

  openBin() {
    wx.navigateTo({ url: `/pages/student-bin/index?studentId=${this.studentId}` });
  },

  openQuarterlySummary() {
    wx.navigateTo({ url: `/pages/quarterly-summary/index?studentId=${this.studentId}` });
  },

  openYearlySummary() {
    wx.navigateTo({ url: `/pages/yearly-summary/index?studentId=${this.studentId}` });
  },

  goSettings() {
    wx.navigateTo({ url: "/pages/settings/index" });
  },

  switchStudent(e) {
    const id = e?.currentTarget?.dataset?.id;
    if (!id || id === this.studentId) return;
    wx.redirectTo({ url: `/pages/student-detail/index?id=${id}` });
  },

  manageSubjects() {
    wx.navigateTo({ url: `/pages/subjects-manage/index?studentId=${this.studentId}` });
  },

  onParentChange(e) {
    if (!this.data.canManageStudentsAndParents) return;
    const index = Number(e.detail.value);
    if (index === 0) {
      this.setData({ selectedParentId: "", selectedParentName: "选择家长" });
      return;
    }
    const parent = (this.availableParents || [])[index - 1];
    if (!parent) return;
    this.setData({ selectedParentId: parent.id, selectedParentName: parent.name });
  },

  addParentBinding() {
    if (!this.data.canManageStudentsAndParents) return;
    const parentId = this.data.selectedParentId;
    if (!parentId) {
      wx.showToast({ title: "请选择家长", icon: "none" });
      return;
    }
    request({
      url: `/students/${this.studentId}/parents`,
      method: "POST",
      data: { parentId },
    })
      .then(() => {
        wx.showToast({ title: "已保存", icon: "success" });
        this.fetchAll();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        wx.showToast({ title: err?.message || "保存失败", icon: "error" });
      });
  },

  removeParentBinding(e) {
    if (!this.data.canManageStudentsAndParents) return;
    const parentId = e.currentTarget.dataset.id;
    const parentName = e.currentTarget.dataset.name || "该家长";
    if (!parentId) return;
    wx.showModal({
      title: "取消绑定？",
      content: `只移除 ${parentName} 与该学生的绑定，不会删除家长账号。`,
      success: (res) => {
        if (!res.confirm) return;
        request({
          url: `/students/${this.studentId}/parents/${parentId}`,
          method: "DELETE",
        })
          .then(() => {
            wx.showToast({ title: "已解绑", icon: "success" });
            this.fetchAll();
          })
          .catch((err) => wx.showToast({ title: err?.message || "解绑失败", icon: "error" }));
      },
    });
  },
});
