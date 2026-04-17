import { db } from './db.ts';
import { adminsTable } from './schema.ts';

async function insertAdmin() {
  const openid = process.env.ADMIN_WECHAT_OPEN_ID;
  if (!openid) {
    throw new Error('Missing ADMIN_WECHAT_OPEN_ID. Please set it before inserting admin.');
  }
  const displayName = process.env.ADMIN_DISPLAY_NAME || '微信管理员';

  await db.insert(adminsTable).values({
    name: displayName,
    displayName,
    authProvider: 'wechat',
    wechatOpenId: openid,
    email: null,
    password: null,
  });
  console.log('WeChat admin inserted!');
  process.exit(0);
}

insertAdmin();
