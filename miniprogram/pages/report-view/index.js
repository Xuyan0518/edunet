Page({
  data: {
    title: "",
    subtitle: "",
    content: "",
    exportReady: false,
    fileName: "",
    saving: false,
  },

  onLoad(query) {
    const payload = wx.getStorageSync("report_view_payload") || {};
    wx.showShareMenu({ withShareTicket: false });
    this.setData({
      title: query.title || payload.title || "",
      subtitle: query.subtitle || payload.subtitle || "",
      content: query.content || payload.content || "",
      exportReady: payload.exportReady === true || query.mode === "export",
      fileName: payload.fileName || "student_summary.md",
    });
  },

  copyContent() {
    const text = this.data.content || "";
    if (!text.trim()) {
      wx.showToast({ title: "暂无可复制内容", icon: "none" });
      return;
    }
    wx.setClipboardData({
      data: text,
      success: () => wx.showToast({ title: "已复制 Markdown", icon: "success" }),
      fail: () => wx.showToast({ title: "复制失败", icon: "none" }),
    });
  },

  saveToLocal() {
    const text = this.data.content || "";
    if (!text.trim()) {
      wx.showToast({ title: "暂无可保存内容", icon: "none" });
      return;
    }
    this.setData({ saving: true });
    const fileName = this.data.fileName || `student_summary_${Date.now()}.md`;
    const filePath = `${wx.env.USER_DATA_PATH}/${fileName}`;
    const fs = wx.getFileSystemManager();
    fs.writeFile({
      filePath,
      data: text,
      encoding: "utf8",
      success: () => {
        wx.openDocument({
          filePath,
          fileType: "txt",
          showMenu: true,
          success: () => wx.showToast({ title: "已保存并打开", icon: "success" }),
          fail: () => wx.showToast({ title: "保存成功，可在文件管理查看", icon: "none" }),
        });
      },
      fail: () => wx.showToast({ title: "保存失败", icon: "none" }),
      complete: () => this.setData({ saving: false }),
    });
  },

  onShareAppMessage() {
    return {
      title: this.data.title || "学习报告",
      path: "/pages/dashboard/index",
    };
  },
});
