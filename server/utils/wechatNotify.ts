type WeChatTokenResponse = {
  access_token?: string;
  expires_in?: number;
  errcode?: number;
  errmsg?: string;
};

type WeChatSendResponse = {
  errcode?: number;
  errmsg?: string;
};

let cachedToken: { value: string; expiresAt: number } | null = null;

const getAccessToken = async () => {
  const now = Date.now();
  if (cachedToken && cachedToken.expiresAt > now) {
    return cachedToken.value;
  }

  const appId = process.env.WECHAT_APP_ID;
  const appSecret = process.env.WECHAT_APP_SECRET;
  if (!appId || !appSecret) return null;

  const url =
    `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential` +
    `&appid=${encodeURIComponent(appId)}` +
    `&secret=${encodeURIComponent(appSecret)}`;
  const res = await fetch(url);
  const data = (await res.json()) as WeChatTokenResponse;
  if (!data.access_token || !data.expires_in) return null;

  cachedToken = {
    value: data.access_token,
    expiresAt: now + (data.expires_in - 60) * 1000,
  };
  return cachedToken.value;
};

export const sendWeChatSubscribeMessage = async (payload: {
  toUser: string;
  templateId: string;
  page: string;
  data: Record<string, { value: string }>;
}) => {
  const token = await getAccessToken();
  if (!token) return { ok: false as const, error: 'Missing access token', errcode: null, errmsg: null };

  const res = await fetch(
    `https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token=${encodeURIComponent(token)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        touser: payload.toUser,
        template_id: payload.templateId,
        page: payload.page,
        data: payload.data,
      }),
    }
  );

  const data = (await res.json()) as WeChatSendResponse;
  if (data.errcode && data.errcode !== 0) {
    return {
      ok: false as const,
      error: data.errmsg || 'WeChat send failed',
      errcode: data.errcode ?? null,
      errmsg: data.errmsg ?? null,
    };
  }
  return { ok: true as const };
};
