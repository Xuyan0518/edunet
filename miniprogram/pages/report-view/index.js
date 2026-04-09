Page({
  data: {
    title: "",
    subtitle: "",
    content: "",
  },

  onLoad(query) {
    const payload = wx.getStorageSync("report_view_payload") || {};
    this.setData({
      title: query.title || payload.title || "",
      subtitle: query.subtitle || payload.subtitle || "",
      content: query.content || payload.content || "",
    });
  },
});
