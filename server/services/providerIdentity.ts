import { sql } from 'drizzle-orm';
import { db } from '../db';

// Provider subjects are proven by the provider callback. An email match alone
// never links independent accounts or gives access to another role.
export async function providerAccountIdentity(ids: { googleSubject?: string; wechatOpenId?: string; wechatUnionId?: string | null; wechatWebOpenId?: string }): Promise<string | undefined> {
  const google = ids.googleSubject || null, open = ids.wechatOpenId || null, union = ids.wechatUnionId || null, web = ids.wechatWebOpenId || null;
  const result = await db.execute(sql`SELECT DISTINCT account_identity_id FROM (
    SELECT account_identity_id FROM admins WHERE google_subject=${google} OR wechat_open_id=${open} OR wechat_union_id=${union} OR wechat_web_open_id=${web}
    UNION ALL SELECT account_identity_id FROM teacher WHERE google_subject=${google} OR wechat_open_id=${open} OR wechat_union_id=${union} OR wechat_web_open_id=${web}
    UNION ALL SELECT account_identity_id FROM parents WHERE google_subject=${google} OR wechat_open_id=${open} OR wechat_union_id=${union} OR wechat_web_open_id=${web}
  ) identities`);
  if (result.rows.length > 1) throw new Error('Provider identity has conflicting accounts');
  return result.rows[0]?.account_identity_id as string | undefined;
}
