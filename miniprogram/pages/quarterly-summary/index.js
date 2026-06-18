const { request } = require("../../utils/api");
const { formatChinaDateTime } = require("../../utils/chinaDate");
const { showConflictModal } = require("../../utils/conflict");
const { showActionLockToast } = require("../../utils/actionLock");
const { LIMITS, trimText, validateDateRange, validateYear } = require("../../utils/validation");

Page({
  data: {
    student: {},
    year: new Date().getFullYear(),
    summaries: {},
    ranges: {},
    quarterOptions: ["第 1 学期", "第 2 学期", "第 3 学期", "第 4 学期"],
    selectedQuarter: 1,
    quarterIndex: 0,
    summary: "",
    rangeStart: "",
    rangeEnd: "",
    isTeacher: false,
    loading: true,
    aiLoading: false,
    summaryCards: [],
    metaByQuarter: {},
    lastUpdatedAt: "",
    lastUpdatedBy: "",
    lastUpdatedAtText: "",
    exportLoading: false,
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
    this.fetchSummaries();
  },

  fetchStudent() {
    request({ url: `/students/${this.studentId}` })
      .then((data) => this.setData({ student: data }))
      .catch(() => wx.showToast({ title: "获取学生失败", icon: "error" }));
  },

  fetchSummaries() {
    this.setData({ loading: true });
    request({ url: `/students/${this.studentId}/quarterly-summary?year=${this.data.year}` })
      .then((data) => {
        const map = {};
        const ranges = {};
        const meta = {};
        const cards = (data || []).map((item) => {
          map[item.quarter] = item.summary || "";
          ranges[item.quarter] = {
            startDate: item.startDate || "",
            endDate: item.endDate || "",
          };
          meta[item.quarter] = {
            updatedAt: item.updatedAt || "",
            updatedByName: item.updatedByName || "",
          };
          const quarterLabel =
            this.data.quarterOptions[item.quarter - 1] || `第 ${item.quarter} 学期`;
          return {
            quarter: item.quarter,
            quarterLabel,
            summary: item.summary || "",
            startDate: item.startDate || "",
            endDate: item.endDate || "",
          };
        });
        const current = map[this.data.selectedQuarter] || "";
        const currentRange = ranges[this.data.selectedQuarter] || {};
        const currentMeta = meta[this.data.selectedQuarter] || {};
        const updatedAtText = currentMeta.updatedAt
          ? formatChinaDateTime(new Date(currentMeta.updatedAt))
          : "";
        this.setData({
          summaries: map,
          ranges,
          summaryCards: cards,
          metaByQuarter: meta,
          summary: current,
          rangeStart: currentRange.startDate || "",
          rangeEnd: currentRange.endDate || "",
          lastUpdatedAt: currentMeta.updatedAt || "",
          lastUpdatedBy: currentMeta.updatedByName || "",
          lastUpdatedAtText: updatedAtText,
        });
      })
      .catch(() => wx.showToast({ title: "获取学期总结失败", icon: "error" }))
      .finally(() => this.setData({ loading: false }));
  },

  onQuarterChange(e) {
    const index = Number(e.detail.value);
    const quarter = index + 1;
    const summary = (this.data.summaries || {})[quarter] || "";
    const range = (this.data.ranges || {})[quarter] || {};
    const meta = (this.data.metaByQuarter || {})[quarter] || {};
    const updatedAtText = meta.updatedAt ? formatChinaDateTime(new Date(meta.updatedAt)) : "";
    this.setData({
      quarterIndex: index,
      selectedQuarter: quarter,
      summary,
      rangeStart: range.startDate || "",
      rangeEnd: range.endDate || "",
      lastUpdatedAt: meta.updatedAt || "",
      lastUpdatedBy: meta.updatedByName || "",
      lastUpdatedAtText: updatedAtText,
    });
  },

  onRangeStartChange(e) {
    this.setData({ rangeStart: e.detail.value });
  },

  onRangeEndChange(e) {
    this.setData({ rangeEnd: e.detail.value });
  },

  onSummaryInput(e) {
    this.setData({ summary: e.detail.value });
  },

  save() {
    if (!this.data.isTeacher) return;
    const yearCheck = validateYear(this.data.year);
    if (!yearCheck.ok) {
      wx.showToast({ title: yearCheck.message, icon: "none" });
      return;
    }
    if (!this.data.rangeStart || !this.data.rangeEnd) {
      wx.showToast({ title: "请选择学期日期范围", icon: "none" });
      return;
    }
    if (this.data.rangeStart > this.data.rangeEnd) {
      wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate: this.data.rangeStart,
      endDate: this.data.rangeEnd,
      maxDays: LIMITS.quarterlyRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: "none" });
      return;
    }
    if (trimText(this.data.summary).length > LIMITS.summaryMax) {
      wx.showToast({ title: `总结过长（最多 ${LIMITS.summaryMax} 字）`, icon: "none" });
      return;
    }
    const payload = {
      year: this.data.year,
      quarter: this.data.selectedQuarter,
      summary: this.data.summary || "",
      startDate: this.data.rangeStart,
      endDate: this.data.rangeEnd,
      updatedAt: this.data.lastUpdatedAt || "",
    };
    request({
      url: `/students/${this.studentId}/quarterly-summary`,
      method: "PUT",
      data: payload,
    })
      .then(() => {
        const summaries = { ...(this.data.summaries || {}) };
        summaries[this.data.selectedQuarter] = this.data.summary || "";
        const ranges = { ...(this.data.ranges || {}) };
        ranges[this.data.selectedQuarter] = {
          startDate: this.data.rangeStart,
          endDate: this.data.rangeEnd,
        };
        const cards = (this.data.summaryCards || []).filter(
          (c) => c.quarter !== this.data.selectedQuarter
        );
        const quarterLabel =
          this.data.quarterOptions[this.data.selectedQuarter - 1] ||
          `第 ${this.data.selectedQuarter} 学期`;
        cards.push({
          quarter: this.data.selectedQuarter,
          quarterLabel,
          summary: this.data.summary || "",
          startDate: this.data.rangeStart,
          endDate: this.data.rangeEnd,
        });
        cards.sort((a, b) => a.quarter - b.quarter);
        this.setData({ summaries, ranges, summaryCards: cards });
        wx.showToast({ title: "已提交审核", icon: "success" });
        this.fetchSummaries();
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        if (showConflictModal(err, () => this.fetchSummaries())) return;
        wx.showToast({ title: "保存失败", icon: "error" });
      });
  },

  generateSummary() {
    if (!this.data.isTeacher) return;
    if (!this.data.rangeStart || !this.data.rangeEnd) {
      wx.showToast({ title: "请选择学期日期范围", icon: "none" });
      return;
    }
    if (this.data.rangeStart > this.data.rangeEnd) {
      wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate: this.data.rangeStart,
      endDate: this.data.rangeEnd,
      maxDays: LIMITS.quarterlyRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: "none" });
      return;
    }
    this.setData({ aiLoading: true });
    request({
      url: "/ai/quarterly-summary",
      method: "POST",
      data: {
        studentId: this.studentId,
        startDate: this.data.rangeStart,
        endDate: this.data.rangeEnd,
      },
    })
      .then((data) => {
        this.setData({ summary: data?.summary || "" });
        wx.showToast({ title: "已生成", icon: "success" });
      })
      .catch((err) => {
        if (showActionLockToast(err)) return;
        const msg = err?.error === "AI_NOT_CONFIGURED" ? "AI未配置" : "生成失败";
        wx.showToast({ title: msg, icon: "none" });
      })
      .finally(() => this.setData({ aiLoading: false }));
  },

  exportRangeReport() {
    if (!this.data.isTeacher) return;
    if (!this.data.rangeStart || !this.data.rangeEnd) {
      wx.showToast({ title: "请选择导出日期范围", icon: "none" });
      return;
    }
    if (this.data.rangeStart > this.data.rangeEnd) {
      wx.showToast({ title: "开始日期不能晚于结束日期", icon: "none" });
      return;
    }
    const rangeCheck = validateDateRange({
      startDate: this.data.rangeStart,
      endDate: this.data.rangeEnd,
      maxDays: LIMITS.exportRangeMaxDays,
    });
    if (!rangeCheck.ok) {
      wx.showToast({ title: rangeCheck.message, icon: "none" });
      return;
    }
    this.setData({ exportLoading: true });
    request({
      url: `/students/${this.studentId}/report-export?startDate=${encodeURIComponent(this.data.rangeStart)}&endDate=${encodeURIComponent(this.data.rangeEnd)}&format=markdown`,
    })
      .then((data) => {
        if (!data?.hasData) {
          wx.showModal({
            title: "暂无可导出数据",
            content: data?.message || "所选日期范围内暂无学习记录",
            showCancel: false,
          });
          return;
        }
        wx.setStorageSync("report_view_payload", {
          title: "学生总结报告",
          subtitle: `${this.data.student?.name || ""} · ${this.data.rangeStart} - ${this.data.rangeEnd}`,
          content: data?.content || "",
          fileName: data?.fileName || "",
          exportReady: true,
        });
        wx.navigateTo({ url: "/pages/report-view/index?mode=export" });
      })
      .catch(() => {
        wx.showToast({ title: "导出失败", icon: "none" });
      })
      .finally(() => this.setData({ exportLoading: false }));
  },

  openSummaryView(e) {
    const dataset = e?.currentTarget?.dataset || {};
    const quarter = Number(dataset.quarter || this.data.selectedQuarter);
    const quarterLabel =
      dataset.quarterLabel ||
      this.data.quarterOptions[quarter - 1] ||
      `第 ${quarter} 学期`;
    const rangeStart = dataset.start || this.data.rangeStart;
    const rangeEnd = dataset.end || this.data.rangeEnd;
    const summary = dataset.summary ?? this.data.summary;
    const rangeText =
      rangeStart && rangeEnd
        ? `${rangeStart} - ${rangeEnd}`
        : "";
    wx.setStorageSync("report_view_payload", {
      title: "学期总结",
      subtitle: `${this.data.student?.name || ""} · ${this.data.year} · ${quarterLabel}${rangeText ? " · " + rangeText : ""}`,
      content: summary || "",
      exportReady: false,
    });
    wx.navigateTo({ url: "/pages/report-view/index" });
  },
});
