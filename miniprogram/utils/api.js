const app = getApp();

const request = ({ url, method = "GET", data, header = {} }) => {
  const baseUrl = app?.globalData?.apiBaseUrl || "http://localhost:3003/api";
  const token = wx.getStorageSync("token");
  const authHeader = token ? { Authorization: `Bearer ${token}` } : {};

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${baseUrl}${url}`,
      method,
      data,
      header: {
        "Content-Type": "application/json",
        ...authHeader,
        ...header,
      },
      success: (res) => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data);
        } else {
          reject(res.data || { error: "Request failed" });
        }
      },
      fail: (err) => reject(err),
    });
  });
};

module.exports = { request };
