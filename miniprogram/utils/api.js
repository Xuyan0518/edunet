const app = getApp();
const { API_BASE_URL } = require("./env");
const defaultApiBaseUrl = API_BASE_URL;

const request = ({ url, method = "GET", data, header = {} }) => {
  const baseUrl = app?.globalData?.apiBaseUrl || defaultApiBaseUrl;
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
          const payload = (res.data && typeof res.data === "object")
            ? { ...res.data }
            : { error: "Request failed" };
          payload.statusCode = res.statusCode;
          reject(payload);
        }
      },
      fail: (err) => reject(err),
    });
  });
};

module.exports = { request };
