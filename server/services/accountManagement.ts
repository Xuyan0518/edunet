import { eq, sql } from 'drizzle-orm';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { adminsTable, teachersTable, parentsTable } from '../schema';
import { hashPassword, isPasswordHash } from '../auth/password';
import { logSafeError } from '../utils/safeLog';

export type AccountRole = 'admin' | 'teacher' | 'parent';
export const roleTable = (role: AccountRole) => role === 'admin' ? adminsTable : role === 'teacher' ? teachersTable : parentsTable;
export const accountRoleSchema = z.enum(['admin', 'teacher', 'parent']);
const sourceInput = z.object({ sourceRole: accountRoleSchema, sourceId: z.string().uuid() });
const updateInput = sourceInput.extend({ roles: z.array(accountRoleSchema).min(1).max(3), displayName: z.string().trim().min(1).max(40).optional() });
const assignInput = sourceInput.extend({ targetRole: accountRoleSchema });

export const manageAccountRoles = (assign = false): RequestHandler => async (req, res) => {
  const input = (assign ? assignInput : updateInput).safeParse(req.body);
  if (!input.success) { res.status(400).json({ error: 'Choose an account, at least one valid role and a name of 1–40 characters.' }); return; }
  const { sourceRole, sourceId } = input.data;
  try {
    const table = roleTable(sourceRole);
    const [source] = await db.select().from(table).where(eq(table.id, sourceId)).limit(1);
    if (!source) { res.status(404).json({ error: 'Source user not found' }); return; }
    if (source.authProvider === 'reviewer') { res.status(403).json({ error: 'Reviewer identities cannot be assigned other roles' }); return; }
    if (source.password?.startsWith('scrypt$') && !isPasswordHash(source.password)) { res.status(400).json({ error: 'Recover this account password before assigning additional roles.' }); return; }
    let roles: AccountRole[];
    if (assign) {
      roles = [(input.data as z.infer<typeof assignInput>).targetRole];
    } else roles = [...new Set((input.data as z.infer<typeof updateInput>).roles)];
    const name = (input.data as z.infer<typeof updateInput>).displayName || source.displayName || source.name;
    const password = source.password && !isPasswordHash(source.password) ? await hashPassword(source.password) : source.password;
    const result = await db.execute(sql`SELECT edunet_set_account_roles(${sourceRole},${sourceId}::uuid,ARRAY(SELECT jsonb_array_elements_text(${JSON.stringify(roles)}::jsonb)),${name},${req.user!.id}::uuid,${source.password},${password},${assign}) AS roles`);
    res.json({ success: true, roles: result.rows[0]?.roles || roles });
  } catch (error) {
    // Match only known, server-owned exception tags; never return SQL details.
    const message = error instanceof Error ? error.message + ' ' + String((error as { cause?: { message?: string } }).cause?.message || '') : '';
    const known: Record<string, string> = { INVALID_ROLE_INPUT: 'Invalid role update request', ADMIN_ACCESS_REQUIRED: 'Administrator access is no longer valid', OWN_ADMIN_ROLE: 'Cannot remove your own admin role', LAST_ADMIN_ROLE: 'Cannot remove the last admin role', PARENT_HAS_BINDINGS: 'Cannot remove parent role while students are linked', ACCOUNT_CHANGED: 'The account changed. Refresh and try again.', REVIEWER_IDENTITY: 'Reviewer identities cannot be assigned other roles', SOURCE_NOT_FOUND: 'Source user not found' };
    const tag = Object.keys(known).find(key => message.includes(key));
    const code = (error as { code?: string; cause?: { code?: string } })?.code || (error as { cause?: { code?: string } })?.cause?.code;
    if (tag) { res.status(tag === 'ADMIN_ACCESS_REQUIRED' ? 403 : tag === 'ACCOUNT_CHANGED' ? 409 : 400).json({ error: known[tag] }); return; }
    if (code === '23505') { res.status(409).json({ error: 'That sign-in identity already belongs to a separate account in the requested role. Accounts were not merged.' }); return; }
    if (code === '23503') { res.status(409).json({ error: 'This account has linked records. Refresh and remove its bindings before changing roles.' }); return; }
    logSafeError('Account role update failed', error);
    res.status(500).json({ error: 'Unable to update roles. Refresh before trying again.' });
  }
};
